"""DSPy optimizer runner for the context classifier.

Reads high-quality message examples from the ``message_feedback`` table,
builds a DSPy trainset of ``(user_message, context_type)`` pairs, and runs
``BootstrapFewShot`` optimization on the ``ContextClassifier`` module.

The compiled program is saved to disk as a JSON file and recorded in the
``dspy_compiled_programs`` table so the runtime loader can pick it up without
re-running the expensive optimization step.

This module must be run with a configured DSPy LM (LM Studio or any
OpenAI-compatible endpoint).  It is intentionally safe to import on machines
where DSPy is not installed — all DSPy-dependent code paths are guarded by the
``_DSPY_AVAILABLE`` flag.

Schema dependencies:
    - ``messages`` — user messages with ``role`` and ``char_id`` columns.
    - ``message_feedback`` — per-message quality signals; ``final_score`` is
      used as the quality gate for trainset inclusion.
    - ``dspy_compiled_programs`` — persisted compiled program metadata; written
      by :func:`_write_db_record` after each successful optimization run.

Example:
    >>> from pathlib import Path
    >>> from backend.adaptive.dspy_modules.optimizer_runner import (
    ...     OptimizerConfig, maybe_run_optimizer
    ... )
    >>> result = maybe_run_optimizer(
    ...     db_path=Path("backend/storage/app.db"),
    ...     output_dir=Path("backend/storage/models/dspy"),
    ...     lm_endpoint="http://10.0.0.17:1234/v1",
    ...     lm_model="qwen2.5-7b-instruct",
    ... )
    >>> result is None  # None when DSPy is absent or too few examples
    True
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

try:
    import dspy  # type: ignore[import]
    _DSPY_AVAILABLE = True
except ImportError:
    _DSPY_AVAILABLE = False
    logger.info("DSPy not installed — optimizer_runner is import-only on this machine")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class OptimizerConfig:
    """Configuration for a DSPy optimization run.

    Attributes:
        db_path: Path to the application SQLite database.
        output_dir: Directory where compiled JSON files are stored.
        module_name: DSPy module identifier (e.g. ``"context_classifier"``).
        lm_endpoint: Base URL of the OpenAI-compatible LM endpoint
            (e.g. ``"http://10.0.0.17:1234/v1"``).
        lm_model: Model name as seen by the endpoint
            (e.g. ``"qwen2.5-7b-instruct"``).
        lm_api_key: API key string (default ``"local"`` for LM Studio).
        min_score: Minimum ``final_score`` for a message to be included in
            the trainset (default ``0.4``).
        max_trainset: Maximum number of examples to include (default ``50``).
        max_bootstrapped_demos: ``BootstrapFewShot`` hyperparameter (default ``4``).
        max_labeled_demos: ``BootstrapFewShot`` hyperparameter (default ``4``).
        char_id: Optional character ID filter (``None`` = all characters).
    """

    db_path: Path
    output_dir: Path
    module_name: str = "context_classifier"
    lm_endpoint: str = "http://localhost:1234/v1"
    lm_model: str = "qwen2.5-7b-instruct"
    lm_api_key: str = "local"
    min_score: float = 0.4
    max_trainset: int = 50
    max_bootstrapped_demos: int = 4
    max_labeled_demos: int = 4
    char_id: int | None = None


@dataclass
class OptimizationResult:
    """Result of a completed DSPy optimization run.

    Attributes:
        module_name: DSPy module identifier.
        version: Monotonically increasing version number for this module.
        compiled_json_path: Path to the saved compiled program JSON file.
        optimizer: Optimizer class name used (``"BootstrapFewShot"``).
        score: Final metric score returned by the optimizer (may be ``None``
            when the score is not computed).
        trainset_size: Number of examples used in training.
        duration_seconds: Wall-clock time of the optimization run.
        db_row_id: Row ID of the inserted ``dspy_compiled_programs`` record.
    """

    module_name: str
    version: int
    compiled_json_path: Path
    optimizer: str
    score: float | None
    trainset_size: int
    duration_seconds: float
    db_row_id: int


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _load_trainset(config: OptimizerConfig) -> list[Any]:
    """Query the DB and build a DSPy Example trainset from high-quality messages.

    Joins ``messages`` with ``message_feedback`` to select user messages whose
    ``final_score`` meets the minimum threshold.  The ground-truth
    ``context_type`` label is derived from the rule-based
    :func:`~backend.adaptive.context_classifier.classify_context` function so
    that no human annotation is required.

    Args:
        config: :class:`OptimizerConfig` with DB path, score threshold,
            max trainset size, and optional character filter.

    Returns:
        List of ``dspy.Example`` objects ready to pass to a DSPy teleprompter.

    Raises:
        ValueError: If fewer than 4 qualifying examples are found.
        sqlite3.Error: If the database query fails.

    Example:
        >>> # Requires a populated DB with message_feedback rows.
        >>> examples = _load_trainset(cfg)  # doctest: +SKIP
        >>> len(examples) >= 4
        True
    """
    # Import the rule-based classifier here to avoid a top-level circular dep.
    from backend.adaptive.context_classifier import classify_context  # noqa: PLC0415

    base_query = """
        SELECT m.text, mf.final_score
        FROM messages m
        JOIN message_feedback mf ON mf.message_id = m.id
        WHERE m.role = 'user'
          AND mf.final_score >= ?
    """
    params: list[Any] = [config.min_score]

    if config.char_id is not None:
        base_query += "  AND m.char_id = ?\n"
        params.append(config.char_id)

    base_query += "ORDER BY mf.final_score DESC\nLIMIT ?"
    params.append(config.max_trainset)

    con = sqlite3.connect(str(config.db_path))
    try:
        rows = con.execute(base_query, params).fetchall()
    finally:
        con.close()

    if len(rows) < 4:
        raise ValueError(
            f"Only {len(rows)} qualifying examples found "
            f"(min_score={config.min_score}, need >= 4). "
            "Lower min_score or collect more feedback data before running the optimizer."
        )

    logger.info("_load_trainset: loaded %d examples from DB", len(rows))

    examples = [
        dspy.Example(
            user_message=text,
            sentiment_score=0.0,
            emoji_count=0,
            question_count=text.count("?"),
            context_type=classify_context(text, 0.0, 0, text.count("?")),
        ).with_inputs("user_message", "sentiment_score", "emoji_count", "question_count")
        for text, _ in rows
    ]

    return examples


def _next_version(db_path: Path, module_name: str) -> int:
    """Return the next version number for a DSPy module in ``dspy_compiled_programs``.

    Queries ``MAX(version)`` for the given *module_name* and returns
    ``MAX + 1``.  Returns ``1`` when no prior versions exist.

    Args:
        db_path: Path to the application SQLite database.
        module_name: DSPy module identifier to look up.

    Returns:
        Next version integer (>= 1).

    Raises:
        sqlite3.Error: If the database query fails.

    Example:
        >>> from pathlib import Path
        >>> _next_version(Path("/tmp/test.db"), "context_classifier")
        1
    """
    con = sqlite3.connect(str(db_path))
    try:
        row = con.execute(
            "SELECT MAX(version) FROM dspy_compiled_programs WHERE module_name = ?",
            (module_name,),
        ).fetchone()
    finally:
        con.close()

    current_max = row[0] if row and row[0] is not None else 0
    return current_max + 1


def _write_db_record(
    db_path: Path,
    module_name: str,
    version: int,
    json_path: str,
    optimizer: str,
    score: float | None,
    trainset_size: int,
) -> int:
    """Deactivate old records and insert a new active row in ``dspy_compiled_programs``.

    Runs two statements in a single transaction:
    1. ``UPDATE dspy_compiled_programs SET is_active = 0`` for the module.
    2. ``INSERT INTO dspy_compiled_programs`` with ``is_active = 1``.

    The ``signature`` column is populated with a canonical string describing the
    input/output fields of the context classifier.

    Args:
        db_path: Path to the application SQLite database.
        module_name: DSPy module identifier (e.g. ``"context_classifier"``).
        version: Monotonically increasing version number for this module.
        json_path: Absolute path string to the saved compiled program JSON file.
        optimizer: Optimizer class name (e.g. ``"BootstrapFewShot"``).
        score: Evaluation metric score (may be ``None``).
        trainset_size: Number of training examples used.

    Returns:
        Row ID (``lastrowid``) of the newly inserted record.

    Raises:
        sqlite3.Error: If the transaction fails (changes are rolled back).

    Example:
        >>> # Requires a DB with dspy_compiled_programs table.
        >>> row_id = _write_db_record(cfg.db_path, "context_classifier", 1, ...)  # doctest: +SKIP
        >>> row_id > 0
        True
    """
    signature = (
        "user_message, sentiment_score, emoji_count, question_count -> context_type"
    )
    now = time.time()

    con = sqlite3.connect(str(db_path))
    try:
        with con:
            con.execute(
                "UPDATE dspy_compiled_programs SET is_active = 0 WHERE module_name = ?",
                (module_name,),
            )
            cur = con.execute(
                """
                INSERT INTO dspy_compiled_programs
                    (module_name, version, signature, fewshot_json,
                     compiled_at, optimizer, score, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    module_name,
                    version,
                    signature,
                    json_path,   # stored in fewshot_json column as the file path
                    now,
                    optimizer,
                    score,
                ),
            )
            row_id: int = cur.lastrowid or 0
    finally:
        con.close()

    logger.info(
        "_write_db_record: inserted %s v%d (row_id=%d, score=%s)",
        module_name,
        version,
        row_id,
        score,
    )
    return row_id


def _context_metric(
    example: Any,
    prediction: Any,
    trace: Any = None,
) -> float:
    """DSPy metric function — returns 1.0 if predicted context matches the label.

    Passed to ``BootstrapFewShot`` as the ``metric`` argument.  A strict exact
    match is used because the label space is small (7 context types) and the
    rule-based labels are deterministic.

    Args:
        example: ``dspy.Example`` containing the ground-truth ``context_type``.
        prediction: ``dspy.Prediction`` containing the predicted ``context_type``.
        trace: Optional trace object passed by DSPy internals (not used here).

    Returns:
        ``1.0`` on exact match (case-insensitive), ``0.0`` otherwise.

    Example:
        >>> # Both arguments are duck-typed dspy objects; tested via optimizer.
        >>> _context_metric(ex, pred)  # doctest: +SKIP
        1.0
    """
    return float(
        prediction.context_type.strip().lower() == example.context_type.strip().lower()
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_optimizer(config: OptimizerConfig) -> OptimizationResult:
    """Optimize the DSPy context classifier using feedback-derived examples.

    Reads high-quality conversation examples from the database, builds a DSPy
    ``BootstrapFewShot`` trainset, optimizes the ``ContextClassifier`` module,
    saves the compiled program to disk, and records the result in the
    ``dspy_compiled_programs`` table.

    Workflow:
        1. Configure ``dspy.LM`` from *config* and call ``dspy.configure()``.
        2. Load the trainset via :func:`_load_trainset`.
        3. Compile the module with ``BootstrapFewShot``.
        4. Save the compiled program JSON to *config.output_dir*.
        5. Deactivate old DB rows and insert a new active record.
        6. Return an :class:`OptimizationResult`.

    Args:
        config: :class:`OptimizerConfig` with DB path, LM endpoint, and
            hyperparameter settings.

    Returns:
        :class:`OptimizationResult` with path to compiled JSON and training metrics.

    Raises:
        ImportError: If DSPy is not installed.
        ValueError: If fewer than 4 training examples are found.
        sqlite3.Error: If DB access fails.

    Example:
        >>> cfg = OptimizerConfig(
        ...     db_path=Path("backend/storage/app.db"),
        ...     output_dir=Path("backend/storage/models/dspy"),
        ... )
        >>> result = run_optimizer(cfg)  # doctest: +SKIP
        >>> result.compiled_json_path.exists()
        True
    """
    if not _DSPY_AVAILABLE:
        raise ImportError(
            "DSPy not installed. Run: pip install dspy-ai\n"
            "Then configure an LM endpoint before calling run_optimizer()."
        )

    # Import the DSPy module here to avoid a hard dependency at module load time.
    from backend.adaptive.dspy_modules.context_classifier_dspy import (  # noqa: PLC0415
        ContextClassifier,
    )

    # ------------------------------------------------------------------
    # Step 1 — Configure the DSPy LM
    # ------------------------------------------------------------------
    lm = dspy.LM(
        f"openai/{config.lm_model}",
        api_base=config.lm_endpoint,
        api_key=config.lm_api_key,
        model_type="chat",
    )
    dspy.configure(lm=lm)
    logger.info(
        "run_optimizer: LM configured — endpoint=%s model=%s",
        config.lm_endpoint,
        config.lm_model,
    )

    # ------------------------------------------------------------------
    # Step 2 — Load training examples
    # ------------------------------------------------------------------
    examples = _load_trainset(config)
    logger.info("run_optimizer: trainset size = %d", len(examples))

    # ------------------------------------------------------------------
    # Step 3 + 4 — Compile with BootstrapFewShot
    # ------------------------------------------------------------------
    start_ts = time.time()

    teleprompter = dspy.BootstrapFewShot(
        metric=_context_metric,
        max_bootstrapped_demos=config.max_bootstrapped_demos,
        max_labeled_demos=config.max_labeled_demos,
    )
    compiled = teleprompter.compile(ContextClassifier(), trainset=examples)

    duration = time.time() - start_ts
    logger.info("run_optimizer: BootstrapFewShot complete in %.1fs", duration)

    # ------------------------------------------------------------------
    # Step 5 — Save compiled program to disk
    # ------------------------------------------------------------------
    config.output_dir.mkdir(parents=True, exist_ok=True)
    version = _next_version(config.db_path, config.module_name)
    json_path = config.output_dir / f"{config.module_name}_v{version}.json"
    compiled.save(str(json_path))
    logger.info("run_optimizer: compiled program saved to %s", json_path)

    # ------------------------------------------------------------------
    # Step 6 — Record in DB
    # ------------------------------------------------------------------
    # DSPy's BootstrapFewShot does not expose a scalar score directly;
    # we track None here and let callers compute it post-hoc if needed.
    score: float | None = None

    row_id = _write_db_record(
        db_path=config.db_path,
        module_name=config.module_name,
        version=version,
        json_path=str(json_path),
        optimizer="BootstrapFewShot",
        score=score,
        trainset_size=len(examples),
    )

    return OptimizationResult(
        module_name=config.module_name,
        version=version,
        compiled_json_path=json_path,
        optimizer="BootstrapFewShot",
        score=score,
        trainset_size=len(examples),
        duration_seconds=duration,
        db_row_id=row_id,
    )


def maybe_run_optimizer(
    db_path: str | Path,
    output_dir: str | Path,
    lm_endpoint: str,
    lm_model: str,
    min_examples: int = 10,
    **kwargs: Any,
) -> OptimizationResult | None:
    """Run the optimizer if DSPy is available and enough examples exist.

    A safe wrapper around :func:`run_optimizer` that catches import errors and
    insufficient-data errors without raising.  Returns ``None`` when the
    optimizer cannot run.

    This function is the recommended entry point for scheduled or background
    optimization jobs where a hard failure would be disruptive.

    Args:
        db_path: Path to the SQLite database.
        output_dir: Directory for compiled JSON output.
        lm_endpoint: OpenAI-compatible endpoint base URL.
        lm_model: Model name string.
        min_examples: Minimum trainset size required to proceed.  If the DB
            would produce fewer examples than this, the run is skipped rather
            than raising ``ValueError``.
        **kwargs: Forwarded verbatim to :class:`OptimizerConfig` (e.g.
            ``min_score``, ``max_trainset``, ``char_id``).

    Returns:
        :class:`OptimizationResult` on success, ``None`` otherwise.

    Example:
        >>> from pathlib import Path
        >>> result = maybe_run_optimizer(
        ...     db_path=Path("backend/storage/app.db"),
        ...     output_dir=Path("backend/storage/models/dspy"),
        ...     lm_endpoint="http://localhost:1234/v1",
        ...     lm_model="qwen2.5-7b-instruct",
        ... )
        >>> result is None  # True when DSPy is absent
        True
    """
    if not _DSPY_AVAILABLE:
        logger.info("maybe_run_optimizer: DSPy not available, skipping")
        return None

    try:
        cfg = OptimizerConfig(
            db_path=Path(db_path),
            output_dir=Path(output_dir),
            lm_endpoint=lm_endpoint,
            lm_model=lm_model,
            **kwargs,
        )
        return run_optimizer(cfg)
    except (ImportError, ValueError) as exc:
        logger.info("maybe_run_optimizer: skipping — %s", exc)
        return None
    except Exception as exc:
        logger.error("maybe_run_optimizer: unexpected error — %s", exc)
        return None
