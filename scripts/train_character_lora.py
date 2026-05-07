#!/usr/bin/env python3
"""Train a character-specific LoRA adapter from conversation history.

Orchestrates the full LoRA training pipeline in four sequential steps:

1. **Corpus build** — reads conversation history from the app SQLite database,
   filters messages by quality, and writes a ShareGPT-format JSONL file.
2. **LoRA train** — fine-tunes a HuggingFace base model using the Unsloth
   library and the corpus produced in step 1.
3. **Eval** — runs the adapter against a set of held-out prompts and reports
   a voice-consistency score.
4. **DB write** — records the adapter path, base model, and eval score in the
   ``character_loras`` table so the app can load it for inference.

This script is designed to run on the **Windows RTX training rig** (CUDA +
Unsloth required), but it imports cleanly on the Mac dev box because all
heavy dependencies are guarded by try/except blocks.

Usage::

    python scripts/train_character_lora.py --char-name Sakura [options]

See ``--help`` for the full option reference.

Example (dry run — corpus only, no training)::

    python scripts/train_character_lora.py \\
        --char-name Sakura \\
        --db-path backend/storage/app.db \\
        --dry-run

Example (full training run on RTX 5080)::

    python scripts/train_character_lora.py \\
        --char-name Sakura \\
        --num-epochs 3 \\
        --lora-r 16 \\
        --bf16
"""

import argparse
import json
import logging
import sqlite3
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Project root on sys.path so backend modules are importable
# ---------------------------------------------------------------------------

_SCRIPT_DIR = Path(__file__).parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
sys.path.insert(0, str(_PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Always-available project imports
# ---------------------------------------------------------------------------

from backend.adaptive.finetune.corpus_builder import (  # noqa: E402
    CorpusConfig,
    CorpusStats,
    build_corpus,
)

# ---------------------------------------------------------------------------
# Optional training / eval imports — not available on Mac or before Unsloth
# is installed.  The CLI exits early with a clear message when these are
# missing and the user hasn't passed --dry-run.
# ---------------------------------------------------------------------------

try:
    from backend.adaptive.finetune.trainer import (  # type: ignore[import]
        TrainingConfig,
        TrainingResult,
        train_lora,
    )

    _TRAINER_AVAILABLE = True
except ImportError:
    _TRAINER_AVAILABLE = False

try:
    from backend.adaptive.finetune.eval_harness import (  # type: ignore[import]
        EvalConfig,
        EvalResult,
        evaluate_lora,
    )

    _EVAL_AVAILABLE = True
except ImportError:
    _EVAL_AVAILABLE = False


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("train_character_lora")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    """Build and return the CLI argument parser.

    Returns:
        Configured :class:`argparse.ArgumentParser` instance.
    """
    parser = argparse.ArgumentParser(
        prog="train_character_lora.py",
        description=(
            "Train a character-specific LoRA adapter from conversation history.\n\n"
            "Steps: corpus build → LoRA train → eval → DB write.\n"
            "Requires CUDA + Unsloth on the training rig. Use --dry-run on the Mac."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # ---- required ----
    parser.add_argument(
        "--char-name",
        required=True,
        metavar="STR",
        help="Character display name to train (must match characters.name in DB).",
    )

    # ---- paths ----
    parser.add_argument(
        "--db-path",
        default=str(_PROJECT_ROOT / "backend" / "storage" / "app.db"),
        metavar="PATH",
        help=(
            "Path to the app SQLite database. "
            "Default: backend/storage/app.db relative to project root."
        ),
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        metavar="PATH",
        help=(
            "Directory where the LoRA adapter will be saved. "
            "Default: backend/storage/models/loras/<char_name>."
        ),
    )

    # ---- model ----
    parser.add_argument(
        "--base-model",
        default="unsloth/Qwen2.5-7B-Instruct",
        metavar="STR",
        help=(
            "HuggingFace model ID or local path for the base model. "
            "Default: unsloth/Qwen2.5-7B-Instruct."
        ),
    )

    # ---- corpus filters ----
    parser.add_argument(
        "--min-score",
        type=float,
        default=0.0,
        metavar="FLOAT",
        help=(
            "Minimum message_feedback.final_score to include in corpus. "
            "0.0 includes all scored messages. Default: 0.0."
        ),
    )
    parser.add_argument(
        "--min-length",
        type=int,
        default=20,
        metavar="INT",
        help=(
            "Minimum assistant message length in characters. "
            "Shorter replies are excluded. Default: 20."
        ),
    )

    # ---- training hyper-params ----
    parser.add_argument(
        "--num-epochs",
        type=int,
        default=3,
        metavar="INT",
        help="Number of fine-tuning epochs. Default: 3.",
    )
    parser.add_argument(
        "--lora-r",
        type=int,
        default=16,
        metavar="INT",
        help="LoRA rank. Higher values = more parameters. Default: 16.",
    )

    # ---- precision (mutually exclusive) ----
    precision_group = parser.add_mutually_exclusive_group()
    precision_group.add_argument(
        "--fp16",
        action="store_true",
        help="Use fp16 precision (recommended for RTX 3070 with 8 GB VRAM).",
    )
    precision_group.add_argument(
        "--bf16",
        action="store_true",
        default=True,
        help=(
            "Use bf16 precision (recommended for RTX 5080 with 16 GB VRAM). "
            "This is the default."
        ),
    )

    # ---- pipeline flags ----
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Build the corpus only. Print stats and exit without training. "
            "Useful on the Mac dev box."
        ),
    )
    parser.add_argument(
        "--no-db-write",
        action="store_true",
        help="Skip writing the result to the character_loras table.",
    )
    parser.add_argument(
        "--eval-prompts",
        type=int,
        default=10,
        metavar="INT",
        help="Number of held-out prompts to use during evaluation. Default: 10.",
    )

    return parser


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------


def _write_to_db(
    db_path: Path,
    char_id: int,
    base_model: str,
    adapter_path: Path,
    eval_score: float | None,
    meta: dict,
) -> None:
    """Deactivate any previous active LoRA and insert the new one.

    Runs inside a single transaction so the deactivate + insert is atomic.

    Args:
        db_path: Filesystem path to the app SQLite database.
        char_id: Integer primary key of the character being trained.
        base_model: HuggingFace model ID used as the base for training.
        adapter_path: Absolute path to the saved PEFT adapter directory.
        eval_score: Voice-consistency eval score, or ``None`` when eval was
            skipped.
        meta: Dict of supplementary training metadata (loss, samples, etc.)
            — serialised to JSON and stored in the ``meta`` column.

    Raises:
        sqlite3.Error: If the database cannot be opened or the INSERT fails.
    """
    trained_at = time.time()
    meta_json = json.dumps(meta)

    con = sqlite3.connect(str(db_path))
    try:
        with con:
            # Deactivate any previously active adapter for this character.
            con.execute(
                "UPDATE character_loras SET is_active = 0"
                " WHERE char_id = ? AND is_active = 1",
                (char_id,),
            )
            # Insert the new adapter row as the active one.
            con.execute(
                """
                INSERT INTO character_loras
                    (char_id, base_model, adapter_path, trained_at,
                     eval_score, is_active, meta)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    char_id,
                    base_model,
                    str(adapter_path),
                    trained_at,
                    eval_score,
                    meta_json,
                ),
            )
    finally:
        con.close()


def _get_char_id(db_path: Path, char_name: str) -> int:
    """Look up the integer primary key for a character by display name.

    Args:
        db_path: Filesystem path to the app SQLite database.
        char_name: Character display name matching ``characters.name``.

    Returns:
        Integer primary key from the ``characters`` table.

    Raises:
        ValueError: If the character name is not found in the database.
        sqlite3.Error: If the database cannot be opened.
    """
    con = sqlite3.connect(str(db_path))
    try:
        row = con.execute(
            "SELECT id FROM characters WHERE name = ?", (char_name,)
        ).fetchone()
    finally:
        con.close()

    if row is None:
        raise ValueError(
            f"Character '{char_name}' not found in the database. "
            "Check the spelling or create the character first."
        )

    return int(row[0])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    """Orchestrate corpus build → LoRA train → eval → DB write.

    Parses CLI arguments, then runs each pipeline stage in sequence.  Stages
    after the corpus build require optional dependencies (Unsloth, PEFT) and
    will abort with a descriptive error when those are missing and ``--dry-run``
    was not passed.

    Raises:
        SystemExit: On argument errors or unrecoverable pipeline failures.
    """
    parser = _build_parser()
    args = parser.parse_args()

    # ---- normalise paths ----
    db_path = Path(args.db_path).resolve()
    char_name: str = args.char_name

    if args.output_dir is not None:
        output_dir = Path(args.output_dir).resolve()
    else:
        output_dir = (
            _PROJECT_ROOT
            / "backend"
            / "storage"
            / "models"
            / "loras"
            / char_name
        )

    corpus_path = output_dir / "corpus.jsonl"

    # ---- precision: fp16 wins if explicitly set, else bf16 ----
    use_fp16: bool = args.fp16
    use_bf16: bool = (not use_fp16)  # bf16 is the default unless --fp16 given

    logger.info("=" * 60)
    logger.info("train_character_lora.py  —  character: %s", char_name)
    logger.info("  db-path    : %s", db_path)
    logger.info("  output-dir : %s", output_dir)
    logger.info("  base-model : %s", args.base_model)
    logger.info("  epochs     : %d  |  lora-r: %d", args.num_epochs, args.lora_r)
    logger.info(
        "  precision  : %s", "fp16" if use_fp16 else "bf16"
    )
    logger.info("  dry-run    : %s", args.dry_run)
    logger.info("=" * 60)

    # Validate DB exists before doing any work.
    if not db_path.exists():
        logger.error("Database not found: %s", db_path)
        sys.exit(1)

    # -------------------------------------------------------------------------
    # Step 1: Corpus build
    # -------------------------------------------------------------------------

    logger.info("STEP 1/4 — Building corpus …")

    corpus_cfg = CorpusConfig(
        char_name=char_name,
        db_path=db_path,
        output_path=corpus_path,
        min_final_score=args.min_score,
        min_assistant_length=args.min_length,
    )

    try:
        stats: CorpusStats = build_corpus(corpus_cfg)
    except ValueError as exc:
        logger.error("Corpus build failed: %s", exc)
        sys.exit(1)

    logger.info(
        "Corpus stats: sessions=%d  total_msgs=%d  included=%d  "
        "low-score=%d  too-short=%d",
        stats.total_sessions,
        stats.total_messages,
        stats.included_messages,
        stats.excluded_low_score,
        stats.excluded_too_short,
    )
    logger.info("Corpus written to: %s", corpus_path)

    if args.dry_run:
        logger.info("--dry-run set — stopping after corpus build. Done.")
        sys.exit(0)

    # Guard against training on trivially small corpora.
    _MIN_SAMPLES = 10
    if stats.included_messages < _MIN_SAMPLES:
        logger.warning(
            "Only %d assistant messages in corpus (minimum is %d). "
            "Skipping training — add more conversation history first.",
            stats.included_messages,
            _MIN_SAMPLES,
        )
        sys.exit(0)

    # -------------------------------------------------------------------------
    # Step 2: LoRA training
    # -------------------------------------------------------------------------

    if not _TRAINER_AVAILABLE:
        logger.error(
            "backend.adaptive.finetune.trainer is not available. "
            "This module requires Unsloth + transformers on the training rig. "
            "Pass --dry-run to stop after corpus build."
        )
        sys.exit(1)

    logger.info("STEP 2/4 — Training LoRA adapter …")

    train_cfg = TrainingConfig(
        base_model=args.base_model,
        corpus_path=corpus_path,
        output_dir=output_dir,
        num_epochs=args.num_epochs,
        lora_r=args.lora_r,
        fp16=use_fp16,
        bf16=use_bf16,
    )

    t0 = time.monotonic()
    train_result: TrainingResult = train_lora(train_cfg)
    duration_s = time.monotonic() - t0

    logger.info(
        "Training complete — loss=%.4f  samples=%d  duration=%.0fs",
        train_result.final_loss,
        train_result.num_samples,
        duration_s,
    )

    # -------------------------------------------------------------------------
    # Step 3: Evaluation
    # -------------------------------------------------------------------------

    eval_score: float | None = None

    if not _EVAL_AVAILABLE:
        logger.warning(
            "backend.adaptive.finetune.eval_harness is not available — "
            "skipping eval. Install the eval harness and re-run to get a "
            "voice-consistency score."
        )
    else:
        logger.info("STEP 3/4 — Evaluating adapter voice consistency …")

        eval_cfg = EvalConfig(
            adapter_path=output_dir,
            base_model=args.base_model,
            db_path=db_path,
            char_name=char_name,
            num_prompts=args.eval_prompts,
        )

        eval_result: EvalResult = evaluate_lora(eval_cfg)
        eval_score = eval_result.score

        logger.info(
            "Eval complete — score=%.4f  (%d prompts)",
            eval_score,
            args.eval_prompts,
        )

    # -------------------------------------------------------------------------
    # Step 4: DB write
    # -------------------------------------------------------------------------

    if args.no_db_write:
        logger.info("--no-db-write set — skipping database update.")
    else:
        logger.info("STEP 4/4 — Writing result to character_loras table …")

        try:
            char_id = _get_char_id(db_path, char_name)
        except ValueError as exc:
            logger.error("DB write failed: %s", exc)
            sys.exit(1)

        meta = {
            "train_loss": train_result.final_loss,
            "num_samples": train_result.num_samples,
            "duration_s": round(duration_s, 1),
        }

        _write_to_db(
            db_path=db_path,
            char_id=char_id,
            base_model=args.base_model,
            adapter_path=output_dir,
            eval_score=eval_score,
            meta=meta,
        )

        logger.info(
            "character_loras updated — char_id=%d  adapter_path=%s",
            char_id,
            output_dir,
        )

    # -------------------------------------------------------------------------
    # Summary table
    # -------------------------------------------------------------------------

    print()
    print("=" * 60)
    print("  Training summary")
    print("=" * 60)
    print(f"  Character   : {char_name}")
    print(f"  Adapter     : {output_dir}")
    print(f"  Base model  : {args.base_model}")
    print(
        f"  Eval score  : "
        f"{eval_score:.4f}" if eval_score is not None else "  Eval score  : (skipped)"
    )
    print(f"  Duration    : {duration_s:.0f}s")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    main()
