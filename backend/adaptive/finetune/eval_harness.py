"""Character voice consistency evaluator for trained LoRA adapters.

Loads a saved LoRA adapter (produced by :mod:`backend.adaptive.finetune.trainer`),
runs a small set of evaluation prompts through the model, and scores each
response using lightweight local heuristics — no second LLM call required.

The aggregate score is a float in ``[0.0, 1.0]`` and is stored in the
``character_loras.eval_score`` column after a successful training run.

Like :mod:`backend.adaptive.finetune.trainer`, this module imports cleanly on
the Mac dev machine even when the ML stack is absent.  All inference functions
raise ``ImportError`` at call time if ``_ML_AVAILABLE`` is ``False``.

Callers: ``scripts/train_character_lora.py`` (post-training evaluation step)

Schema dependency:
    - ``character_loras`` table (eval_score column — written by caller, not here)

Example:
    >>> from backend.adaptive.finetune.eval_harness import evaluate_lora, EvalConfig
    >>> from pathlib import Path
    >>> cfg = EvalConfig(
    ...     adapter_path=Path("/tmp/sakura_lora"),
    ...     char_name="Sakura",
    ... )
    >>> result = evaluate_lora(cfg)  # raises ImportError on Mac
    >>> print(f"Score: {result.score:.2f}")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional ML deps — only available on the Windows training rig (CUDA)
# ---------------------------------------------------------------------------

try:
    import torch  # type: ignore[import]
    from unsloth import FastLanguageModel  # type: ignore[import]

    _ML_AVAILABLE = True
except ImportError:
    _ML_AVAILABLE = False
    logger.info(
        "ML inference deps not available — eval_harness is import-only on this machine"
    )


# ---------------------------------------------------------------------------
# Evaluation prompt library
# ---------------------------------------------------------------------------

# Per-character evaluation prompts keyed by lowercase character name.
# The ``_default`` key is used when no character-specific prompts are defined.
# Prompts are intentionally open-ended to elicit natural conversational responses
# rather than factual answers — the heuristics reward personal, engaged replies.
DEFAULT_EVAL_PROMPTS: dict[str, list[str]] = {
    "sakura": [
        "Tell me about your favorite cherry blossom memory.",
        "How do you feel when someone makes you laugh?",
        "What's the most important thing in your life right now?",
        "Do you ever feel lonely?",
        "What would you do on a perfect spring day?",
    ],
    "_default": [
        "How are you feeling today?",
        "What do you enjoy doing?",
        "Tell me something about yourself.",
        "What makes you happy?",
        "Do you have any dreams or goals?",
    ],
}

# Phrases that indicate the model refused to answer.  A prompt whose response
# starts with any of these receives a score of 0.0 regardless of length or style.
_REFUSAL_PREFIXES: tuple[str, ...] = (
    "i can't",
    "i cannot",
    "i'm unable",
    "i am unable",
    "sorry,",
    "sorry.",
    "i'm sorry",
    "i am sorry",
)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class EvalConfig:
    """Configuration for LoRA character voice evaluation.

    Attributes:
        adapter_path: Path to the saved LoRA adapter directory (the
            ``output_dir`` from a completed ``TrainingConfig`` run).
        char_name: Human-readable character name.  Used to select prompts from
            ``DEFAULT_EVAL_PROMPTS`` (case-insensitive lookup).
        base_model: Unsloth HuggingFace Hub ID of the base model — must match
            the model used during training.
        max_seq_length: Maximum token sequence length passed to Unsloth.
        num_eval_prompts: Number of prompts to run.  If the character's prompt
            list is shorter, all available prompts are used.
        max_new_tokens: Maximum tokens the model may generate per response.
            Keep this modest (≤ 200) so evaluation completes quickly.
    """

    adapter_path: Path
    char_name: str
    base_model: str = "unsloth/Qwen2.5-7B-Instruct"
    max_seq_length: int = 2048
    num_eval_prompts: int = 10
    max_new_tokens: int = 200


@dataclass
class EvalResult:
    """Result of character voice evaluation.

    Attributes:
        score: Aggregate character voice consistency score in ``[0.0, 1.0]``.
            Higher is better.  Suitable for direct storage in
            ``character_loras.eval_score``.
        char_name: Character name from the original ``EvalConfig``.
        num_prompts_tested: How many prompts were actually evaluated (may be
            less than ``EvalConfig.num_eval_prompts`` if the prompt list is
            shorter).
        details: Per-prompt breakdown — each entry is a dict with keys
            ``"prompt"``, ``"response"``, and ``"score"`` (float).
    """

    score: float
    char_name: str
    num_prompts_tested: int
    details: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Scoring heuristics
# ---------------------------------------------------------------------------


def _score_response(response: str) -> float:
    """Score a single generated response for character voice quality.

    Uses fast, local heuristics — no additional model inference is performed.
    The score components are:

    * **Refusal check** (hard gate): if the response (lowercased, stripped)
      starts with a known refusal prefix, return ``0.0`` immediately.
    * **Length penalty**: responses under 50 characters receive a ``-0.1``
      adjustment (applied before clamping).
    * **First-person language** (+0.1 each, capped at +0.3): rewards personal
      pronouns ("I ", "I've", "I'm", "I'd", "I'll", "my ") as a proxy for the
      model staying in character rather than giving generic information.
    * **Engagement markers** (+0.1 each, capped at +0.2): rewards use of
      questions (``?``), ellipsis (``...``), and exclamations (``!``) as
      indicators of an expressive, conversational reply.

    The raw score starts at 0.5 (neutral), adjustments are applied, and the
    result is clamped to ``[0.0, 1.0]``.

    Args:
        response: The decoded text generated by the model for a single prompt.

    Returns:
        Float in ``[0.0, 1.0]`` representing voice quality for this response.

    Example:
        >>> _score_response("I'm doing great! How about you?")
        0.8
        >>> _score_response("I can't help with that.")
        0.0
        >>> _score_response("ok")
        0.4
    """
    stripped = response.strip()
    lower = stripped.lower()

    # Hard gate — refusals score zero.
    for prefix in _REFUSAL_PREFIXES:
        if lower.startswith(prefix):
            return 0.0

    score = 0.5  # Neutral baseline.

    # Length penalty — very short responses suggest the model collapsed.
    if len(stripped) < 50:
        score -= 0.1

    # First-person usage — personal language signals in-character generation.
    first_person_markers = ("I ", "I've", "I'm", "I'd", "I'll", "my ", "My ")
    first_person_bonus = min(
        0.3,
        sum(0.1 for marker in first_person_markers if marker in response)
    )
    score += first_person_bonus

    # Engagement markers — expressive punctuation signals lively output.
    engagement_bonus = 0.0
    if "?" in stripped:
        engagement_bonus += 0.1
    if "..." in stripped:
        engagement_bonus += 0.1
    if "!" in stripped:
        engagement_bonus += 0.1
    score += min(0.2, engagement_bonus)

    return max(0.0, min(1.0, score))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_lora(config: EvalConfig) -> EvalResult:
    """Evaluate a trained LoRA adapter for character voice consistency.

    Loads the adapter from ``config.adapter_path``, sets the model to inference
    mode via Unsloth's fast-path optimisation, then runs each evaluation prompt
    through the model.  Responses are scored by :func:`_score_response` and the
    aggregate mean is returned as ``EvalResult.score``.

    This function must be called on a machine with CUDA, ``torch``, and
    ``unsloth`` installed.  On the Mac dev machine it raises ``ImportError``
    immediately.

    Args:
        config: ``EvalConfig`` specifying the adapter path, character name, and
            inference parameters.

    Returns:
        ``EvalResult`` with the aggregate score (``[0.0, 1.0]``) and per-prompt
        details.

    Raises:
        ImportError: If ML deps (``torch``, ``unsloth``) are not installed.
            Install with: ``pip install unsloth torch``
        FileNotFoundError: If ``config.adapter_path`` does not exist.
        RuntimeError: If model loading or inference fails.

    Example:
        >>> cfg = EvalConfig(
        ...     adapter_path=Path("/tmp/sakura_lora"),
        ...     char_name="Sakura",
        ... )
        >>> result = evaluate_lora(cfg)
        >>> print(f"Score: {result.score:.2f}")
        Score: 0.73
    """
    if not _ML_AVAILABLE:
        raise ImportError(
            "ML inference deps not installed. Run on the Windows training rig with: "
            "pip install unsloth torch"
        )

    if not config.adapter_path.exists():
        raise FileNotFoundError(
            f"Adapter directory not found: {config.adapter_path}. "
            "Run train_lora() first."
        )

    # Select evaluation prompts for this character.
    prompts_pool = DEFAULT_EVAL_PROMPTS.get(
        config.char_name.lower(),
        DEFAULT_EVAL_PROMPTS["_default"],
    )
    prompts = prompts_pool[: config.num_eval_prompts]
    logger.info(
        "Evaluating '%s' adapter with %d prompts", config.char_name, len(prompts)
    )

    # Load the adapter.  Unsloth loads the base model from the adapter directory
    # (which contains adapter_config.json referencing the base model) and merges
    # the LoRA weights automatically.
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=str(config.adapter_path),
            max_seq_length=config.max_seq_length,
            dtype=None,
            load_in_4bit=True,
        )
        model = FastLanguageModel.for_inference(model)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load adapter from '{config.adapter_path}': {exc}"
        ) from exc

    details: list[dict] = []
    scores: list[float] = []

    for prompt_text in prompts:
        # Format as a single-turn user message using the model's chat template.
        messages = [{"role": "user", "content": prompt_text}]
        try:
            formatted_input = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        except Exception as exc:  # pragma: no cover — training-rig only
            logger.warning("Skipping prompt due to template error: %s", exc)
            continue

        inputs = tokenizer(formatted_input, return_tensors="pt").to(model.device)

        with torch.inference_mode():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=config.max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id,
            )

        # Decode only the newly generated tokens (strip the prompt prefix).
        prompt_length = inputs["input_ids"].shape[1]
        generated_ids = output_ids[0][prompt_length:]
        response_text = tokenizer.decode(generated_ids, skip_special_tokens=True)

        prompt_score = _score_response(response_text)
        scores.append(prompt_score)
        details.append(
            {
                "prompt": prompt_text,
                "response": response_text,
                "score": prompt_score,
            }
        )

        logger.debug(
            "Prompt score=%.2f | prompt=%r | response=%r",
            prompt_score,
            prompt_text[:60],
            response_text[:80],
        )

    if not scores:
        logger.warning("No prompts were evaluated for '%s' — returning score 0.0", config.char_name)
        aggregate_score = 0.0
    else:
        aggregate_score = max(0.0, min(1.0, sum(scores) / len(scores)))

    logger.info(
        "Evaluation complete | char=%s | prompts=%d | score=%.3f",
        config.char_name,
        len(scores),
        aggregate_score,
    )

    return EvalResult(
        score=aggregate_score,
        char_name=config.char_name,
        num_prompts_tested=len(scores),
        details=details,
    )
