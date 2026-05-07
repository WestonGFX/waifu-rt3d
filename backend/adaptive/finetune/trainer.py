"""Unsloth-based LoRA fine-tuning wrapper for Qwen 2.5 7B Instruct.

Designed to run on Windows RTX hardware (RTX 5080 / RTX 3070) where
``torch``, ``unsloth``, and the supporting ML stack are installed.  On the
Mac dev machine this module imports cleanly but all training functions raise
``ImportError`` immediately — the ``_ML_AVAILABLE`` flag signals which
environment is active.

Callers: ``scripts/train_character_lora.py``

Schema dependency:
    - ``character_loras`` table (read/write — records trained adapters)

Example:
    >>> from backend.adaptive.finetune.trainer import train_lora, TrainingConfig
    >>> from pathlib import Path
    >>> cfg = TrainingConfig(
    ...     corpus_path=Path("/tmp/sakura_corpus.jsonl"),
    ...     output_dir=Path("/tmp/sakura_lora"),
    ...     char_name="Sakura",
    ... )
    >>> result = train_lora(cfg)  # raises ImportError on Mac
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional ML deps — only available on the Windows training rig (CUDA)
# ---------------------------------------------------------------------------

try:
    import torch  # type: ignore[import]
    from datasets import Dataset  # type: ignore[import]
    from peft import LoraConfig  # type: ignore[import]
    from transformers import TrainingArguments  # type: ignore[import]
    from unsloth import FastLanguageModel  # type: ignore[import]
    from trl import SFTTrainer  # type: ignore[import]

    _ML_AVAILABLE = True
except ImportError:
    _ML_AVAILABLE = False
    logger.info(
        "ML training deps not available — trainer is import-only on this machine"
    )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TrainingConfig:
    """Configuration for a LoRA fine-tuning run.

    Attributes:
        corpus_path: Path to the ``.jsonl`` file produced by corpus_builder.
            Each line must be a JSON object with a ``"conversations"`` key
            (ShareGPT format).
        output_dir: Directory where the LoRA adapter weights will be saved.
            Created automatically if it does not exist.
        char_name: Human-readable character name used in log messages and the
            ``character_loras`` table.
        base_model: Unsloth HuggingFace Hub ID.  Locked to Qwen 2.5 7B Instruct.
        max_seq_length: Maximum token length for a training sample.  Samples
            longer than this are truncated by the tokenizer.
        lora_r: LoRA rank.  Higher values give more capacity at the cost of
            more GPU memory and slower training.
        lora_alpha: LoRA scaling factor.  Conventionally set to ``2 * lora_r``.
        lora_dropout: Dropout probability applied to LoRA layers (regularisation).
        num_epochs: Number of full passes over the training corpus.
        per_device_train_batch_size: Samples processed per GPU step.
        gradient_accumulation_steps: Steps between parameter updates — effective
            batch size is ``per_device_train_batch_size * gradient_accumulation_steps``.
        learning_rate: Peak AdamW learning rate.
        warmup_ratio: Fraction of total steps spent linearly warming up the LR.
        weight_decay: L2 regularisation coefficient for AdamW.
        fp16: Use FP16 mixed precision.  Set ``True`` for RTX 3070 which lacks
            native BFloat16 support.
        bf16: Use BF16 mixed precision.  Set ``True`` for RTX 5080.  Mutually
            exclusive with ``fp16``.
        seed: Random seed for reproducibility.
    """

    corpus_path: Path
    output_dir: Path
    char_name: str
    base_model: str = "unsloth/Qwen2.5-7B-Instruct"
    max_seq_length: int = 2048
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    num_epochs: int = 3
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-4
    warmup_ratio: float = 0.03
    weight_decay: float = 0.01
    fp16: bool = False
    bf16: bool = True
    seed: int = 42


@dataclass
class TrainingResult:
    """Result from a completed training run.

    Attributes:
        adapter_path: Directory containing the saved LoRA adapter weights and
            tokenizer.  Pass this to ``EvalConfig.adapter_path`` to evaluate.
        char_name: Character name from the original ``TrainingConfig``.
        base_model: Base model ID used for the run.
        train_loss: Final training loss (last entry in Trainer's log history).
        num_epochs: Number of epochs completed.
        num_samples: Number of training samples read from the corpus file.
        duration_seconds: Wall-clock seconds from start to save completion.
        trained_at: Unix timestamp (``time.time()``) recorded after saving.
    """

    adapter_path: Path
    char_name: str
    base_model: str
    train_loss: float
    num_epochs: int
    num_samples: int
    duration_seconds: float
    trained_at: float


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _load_corpus(corpus_path: Path) -> list[dict]:
    """Read a ShareGPT-format JSONL corpus file into a list of records.

    Args:
        corpus_path: Path to the ``.jsonl`` file.  Each line must be valid JSON
            with a ``"conversations"`` key.

    Returns:
        List of parsed JSON objects (one per line, blank lines skipped).

    Raises:
        FileNotFoundError: If ``corpus_path`` does not exist.
        json.JSONDecodeError: If any non-blank line is not valid JSON.
    """
    if not corpus_path.exists():
        raise FileNotFoundError(
            f"Corpus file not found: {corpus_path}. "
            "Run scripts/build_character_corpus.py first."
        )

    records: list[dict] = []
    for line_number, raw_line in enumerate(corpus_path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        try:
            records.append(json.loads(stripped))
        except json.JSONDecodeError as exc:
            raise json.JSONDecodeError(
                f"Invalid JSON on line {line_number} of {corpus_path}: {exc.msg}",
                exc.doc,
                exc.pos,
            ) from exc

    logger.info("Loaded %d training samples from %s", len(records), corpus_path)
    return records


def _format_conversations(records: list[dict], tokenizer) -> list[dict]:  # type: ignore[valid-type]
    """Apply the chat template to each ShareGPT conversation record.

    Converts ``{"conversations": [{"from": "...", "value": "..."}]}`` entries
    into ``{"text": "<formatted prompt>"}`` entries that SFTTrainer expects.

    Args:
        records: List of ShareGPT-format dicts from :func:`_load_corpus`.
        tokenizer: A HuggingFace tokenizer with ``apply_chat_template`` support.

    Returns:
        List of ``{"text": str}`` dicts ready for ``Dataset.from_list``.
    """
    formatted: list[dict] = []
    skipped = 0

    for record in records:
        conversations = record.get("conversations", [])
        if not conversations:
            skipped += 1
            continue

        # Convert from ShareGPT role names to HuggingFace role names.
        # ShareGPT uses "human" / "gpt"; chat templates expect "user" / "assistant".
        messages = []
        for turn in conversations:
            role_raw = turn.get("from", "")
            role = "user" if role_raw == "human" else "assistant"
            messages.append({"role": role, "content": turn.get("value", "")})

        try:
            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
        except Exception as exc:  # pragma: no cover — training-rig only
            logger.warning("Skipping malformed conversation: %s", exc)
            skipped += 1
            continue

        formatted.append({"text": text})

    if skipped:
        logger.warning("Skipped %d records with empty/malformed conversations", skipped)

    return formatted


def _extract_final_loss(log_history: list[dict]) -> float:
    """Extract the final training loss from the Trainer's log history.

    Args:
        log_history: ``trainer.state.log_history`` — list of dicts produced by
            HuggingFace Trainer after each logging step.

    Returns:
        The most recently logged ``"loss"`` value, or ``float("nan")`` if the
        history is empty or contains no loss entries.
    """
    for entry in reversed(log_history):
        if "loss" in entry:
            return float(entry["loss"])
    return float("nan")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def train_lora(config: TrainingConfig) -> TrainingResult:
    """Fine-tune a character LoRA adapter using Unsloth.

    Loads the base Qwen 2.5 7B Instruct model in 4-bit via Unsloth, applies a
    PEFT LoRA configuration, formats the training corpus with the tokenizer's
    chat template, and runs supervised fine-tuning via TRL's ``SFTTrainer``.
    The resulting adapter weights are saved to ``config.output_dir``.

    This function must be called on a machine with CUDA, ``torch``,
    ``unsloth``, ``peft``, ``trl``, ``transformers``, and ``datasets``
    installed.  On the Mac dev machine it raises ``ImportError`` immediately.

    Args:
        config: ``TrainingConfig`` specifying the corpus path, output directory,
            model, and all hyperparameters.

    Returns:
        ``TrainingResult`` with the adapter path and key training metrics.

    Raises:
        ImportError: If ML deps (``torch``, ``unsloth``, etc.) are not
            installed.  Install with:
            ``pip install unsloth torch trl peft transformers datasets``
        FileNotFoundError: If ``config.corpus_path`` does not exist.
        RuntimeError: If training itself fails (wrapped from the underlying
            exception with context).

    Example:
        >>> cfg = TrainingConfig(
        ...     corpus_path=Path("/tmp/sakura_corpus.jsonl"),
        ...     output_dir=Path("/tmp/sakura_lora"),
        ...     char_name="Sakura",
        ... )
        >>> result = train_lora(cfg)
        >>> print(result.adapter_path)
        /tmp/sakura_lora
    """
    if not _ML_AVAILABLE:
        raise ImportError(
            "ML training deps not installed. Run on the Windows training rig with: "
            "pip install unsloth torch trl peft transformers datasets"
        )

    start_time = time.monotonic()
    logger.info(
        "Starting LoRA training for character '%s' | model=%s | epochs=%d",
        config.char_name,
        config.base_model,
        config.num_epochs,
    )

    # Step 1 — Load corpus.
    records = _load_corpus(config.corpus_path)
    num_samples = len(records)
    if num_samples == 0:
        raise RuntimeError(
            f"Corpus at {config.corpus_path} is empty — nothing to train on."
        )

    # Step 2 — Load base model + tokenizer via Unsloth (4-bit quantisation).
    logger.info("Loading base model: %s", config.base_model)
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=config.base_model,
            max_seq_length=config.max_seq_length,
            dtype=None,       # Auto-detect: bfloat16 on Ampere+, float16 otherwise.
            load_in_4bit=True,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load base model '{config.base_model}': {exc}"
        ) from exc

    # Step 3 — Apply LoRA via Unsloth's PEFT wrapper.
    logger.info(
        "Applying LoRA | r=%d | alpha=%d | dropout=%.2f",
        config.lora_r,
        config.lora_alpha,
        config.lora_dropout,
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=config.lora_r,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        bias="none",
        use_gradient_checkpointing="unsloth",  # Unsloth's memory-efficient impl.
        random_state=config.seed,
    )

    # Step 4 — Format conversations with the chat template + build HF Dataset.
    logger.info("Formatting %d training samples with chat template", num_samples)
    formatted = _format_conversations(records, tokenizer)
    if not formatted:
        raise RuntimeError("All corpus records were skipped during formatting.")
    dataset = Dataset.from_list(formatted)

    # Step 5 — Configure the HuggingFace Trainer.
    config.output_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(config.output_dir),
        num_train_epochs=config.num_epochs,
        per_device_train_batch_size=config.per_device_train_batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        learning_rate=config.learning_rate,
        warmup_ratio=config.warmup_ratio,
        weight_decay=config.weight_decay,
        fp16=config.fp16,
        bf16=config.bf16,
        seed=config.seed,
        logging_steps=10,
        save_strategy="no",    # We save manually below for clean adapter-only output.
        report_to="none",      # Disable wandb / mlflow — local training only.
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=config.max_seq_length,
        args=training_args,
    )

    # Step 6 — Train.
    logger.info("Training started — %d samples, %d epochs", len(formatted), config.num_epochs)
    try:
        trainer.train()
    except Exception as exc:
        raise RuntimeError(f"Training failed for '{config.char_name}': {exc}") from exc

    train_loss = _extract_final_loss(trainer.state.log_history)
    logger.info("Training complete | final_loss=%.4f", train_loss)

    # Step 7 — Save adapter weights + tokenizer.
    logger.info("Saving adapter to %s", config.output_dir)
    model.save_pretrained(config.output_dir)
    tokenizer.save_pretrained(config.output_dir)

    duration = time.monotonic() - start_time
    trained_at = time.time()

    logger.info(
        "LoRA adapter saved | char=%s | samples=%d | duration=%.1fs",
        config.char_name,
        num_samples,
        duration,
    )

    return TrainingResult(
        adapter_path=config.output_dir,
        char_name=config.char_name,
        base_model=config.base_model,
        train_loss=train_loss,
        num_epochs=config.num_epochs,
        num_samples=num_samples,
        duration_seconds=duration,
        trained_at=trained_at,
    )
