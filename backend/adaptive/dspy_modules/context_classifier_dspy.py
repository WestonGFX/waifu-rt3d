"""DSPy-optimized context classifier for adaptive AI companion behaviour.

Wraps the 7-class context classification task as a DSPy Signature, enabling
few-shot optimization via BootstrapFewShot or MIPROv2.  Falls back to the
rule-based :func:`backend.adaptive.context_classifier.classify_context` when
DSPy is not installed.

The 7 context types mirror those defined in
:mod:`backend.adaptive.context_classifier` exactly:
    - ``emotional_support``    — sadness or negative affect
    - ``casual_chat``          — default / unclassified
    - ``creative_roleplay``    — imaginative / in-character exchanges
    - ``deep_philosophical``   — reflective, long-form inquiry
    - ``playful_flirty``       — high-energy, positive, teasing tone
    - ``factual_qa``           — information-seeking questions
    - ``comfort_reassurance``  — acute distress, user needs calming

Schema dependency:
    ``dspy_compiled_programs`` table (v78 migration) — stores version-stamped
    JSON blobs produced by the DSPy optimizer and controls which version is
    active via the ``is_active`` flag.

Example:
    >>> from backend.adaptive.dspy_modules.context_classifier_dspy import (
    ...     classify_context_dspy, VALID_CONTEXTS, _DSPY_AVAILABLE
    ... )
    >>> result = classify_context_dspy("I feel so sad today", -0.3, 0, 0)
    >>> result in VALID_CONTEXTS
    True
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

try:
    import dspy  # type: ignore[import]
    _DSPY_AVAILABLE = True
except ImportError:
    _DSPY_AVAILABLE = False
    logger.info(
        "DSPy not installed — context_classifier_dspy falls back to rule-based mode"
    )

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODULE_NAME = "context_classifier"

VALID_CONTEXTS: tuple[str, ...] = (
    "emotional_support",
    "casual_chat",
    "creative_roleplay",
    "deep_philosophical",
    "playful_flirty",
    "factual_qa",
    "comfort_reassurance",
)

# ---------------------------------------------------------------------------
# DSPy Signature — only defined when DSPy is available so this module is
# importable even in environments where DSPy has not been installed.
# ---------------------------------------------------------------------------

if _DSPY_AVAILABLE:

    class ContextClassificationSignature(dspy.Signature):
        """Classify a user message into one of 7 conversation context types.

        The context type drives how the AI companion adjusts its response style.
        Choose the MOST SPECIFIC matching type, defaulting to casual_chat.
        """

        user_message: str = dspy.InputField(
            desc="The user's raw message text"
        )
        sentiment_score: float = dspy.InputField(
            desc="Sentiment polarity from -1.0 (very negative) to +1.0 (very positive)"
        )
        emoji_count: int = dspy.InputField(
            desc="Number of emoji characters in the message"
        )
        question_count: int = dspy.InputField(
            desc="Number of question marks in the message"
        )
        context_type: str = dspy.OutputField(
            desc=(
                "One of: emotional_support, casual_chat, creative_roleplay, "
                "deep_philosophical, playful_flirty, factual_qa, comfort_reassurance"
            )
        )

# ---------------------------------------------------------------------------
# DSPy Module — also conditionally defined
# ---------------------------------------------------------------------------

if _DSPY_AVAILABLE:

    class ContextClassifier(dspy.Module):
        """DSPy module for context classification with few-shot optimization.

        Wraps a ChainOfThought predictor over
        :class:`ContextClassificationSignature`.  After the optimizer runs,
        the compiled few-shot demos are saved to a JSON file and loaded here
        via :meth:`dspy.Module.load` so that every subsequent call benefits
        from prior optimization.

        Example:
            >>> lm = dspy.LM("openai/gpt-4o-mini")
            >>> dspy.configure(lm=lm)
            >>> clf = ContextClassifier()
            >>> pred = clf("How are you feeling?", 0.1, 0, 1)
            >>> pred.context_type in VALID_CONTEXTS
            True
        """

        def __init__(self) -> None:
            super().__init__()
            self.predict = dspy.ChainOfThought(ContextClassificationSignature)

        def forward(
            self,
            user_message: str,
            sentiment_score: float,
            emoji_count: int,
            question_count: int,
        ) -> "dspy.Prediction":
            """Run the classifier forward pass.

            Args:
                user_message: Raw user message text.
                sentiment_score: Polarity in [-1.0, 1.0].
                emoji_count: Number of emoji in the message.
                question_count: Number of question marks.

            Returns:
                dspy.Prediction with a ``context_type`` field set to one of
                the seven VALID_CONTEXTS strings.
            """
            return self.predict(
                user_message=user_message,
                sentiment_score=sentiment_score,
                emoji_count=emoji_count,
                question_count=question_count,
            )

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def classify_context_dspy(
    user_message: str,
    sentiment_score: float,
    emoji_count: int,
    question_count: int,
    compiled_json_path: str | Path | None = None,
) -> str:
    """Classify a user message using the DSPy-optimized context classifier.

    Uses the DSPy ChainOfThought predictor when DSPy is installed.  Falls back
    to the rule-based :func:`backend.adaptive.context_classifier.classify_context`
    when DSPy is not available.

    The function is intentionally forgiving: any unexpected output from the DSPy
    predictor (unknown context label, exception, timeout) causes a silent fallback
    to the rule-based classifier rather than raising an exception.  This keeps the
    companion responsive even when the LLM backing DSPy is temporarily unavailable.

    Args:
        user_message: Raw user message text.
        sentiment_score: Sentiment polarity in [-1.0, 1.0].
        emoji_count: Number of emoji in the message.
        question_count: Number of question marks in the message.
        compiled_json_path: Optional path to a compiled DSPy program JSON file
            produced by the optimizer.  When ``None``, the unoptimized predictor
            runs zero-shot.  The file is loaded via :meth:`dspy.Module.load`.

    Returns:
        One of the seven :data:`VALID_CONTEXTS` strings.  Returns
        ``"casual_chat"`` on any error so downstream code always receives a
        valid context.

    Example:
        >>> result = classify_context_dspy("I feel so sad today", -0.3, 0, 0)
        >>> result in VALID_CONTEXTS
        True
        >>> result = classify_context_dspy("What is the capital of France?", 0.0, 0, 1)
        >>> result in VALID_CONTEXTS
        True
    """
    if not _DSPY_AVAILABLE:
        # Fallback to rule-based logic directly (NOT classify_context, which
        # would re-enter the DSPy flag path and cause infinite recursion).
        from backend.adaptive.context_classifier import _classify_rule_based
        return _classify_rule_based(user_message, sentiment_score, emoji_count, question_count)

    try:
        classifier = ContextClassifier()  # type: ignore[name-defined]
        if compiled_json_path is not None:
            p = Path(compiled_json_path)
            if p.exists():
                classifier.load(str(p))
                logger.debug("Loaded compiled DSPy program from %s", p)
            else:
                logger.debug(
                    "Compiled DSPy program not found at %s — running zero-shot", p
                )

        prediction = classifier(
            user_message=user_message,
            sentiment_score=sentiment_score,
            emoji_count=emoji_count,
            question_count=question_count,
        )
        ctx = prediction.context_type.strip().lower()
        if ctx not in VALID_CONTEXTS:
            logger.warning(
                "DSPy classifier returned unknown context '%s', falling back to casual_chat",
                ctx,
            )
            return "casual_chat"
        return ctx
    except Exception as exc:
        logger.error(
            "DSPy classify_context_dspy failed: %s — falling back to rule-based", exc
        )
        from backend.adaptive.context_classifier import _classify_rule_based
        return _classify_rule_based(user_message, sentiment_score, emoji_count, question_count)


def load_compiled_classifier(
    db_path: str | Path,
    compiled_json_dir: str | Path,
) -> str | None:
    """Look up the active compiled DSPy program path from the database.

    Queries the ``dspy_compiled_programs`` table for the highest-versioned active
    row where ``module_name = 'context_classifier'`` and resolves the path to its
    compiled JSON file on disk.  Returns ``None`` when no active program is found
    or when the resolved file does not exist.

    The file is named ``context_classifier_v{version}.json`` inside
    *compiled_json_dir*.  Pass the returned path directly to
    :func:`classify_context_dspy` as ``compiled_json_path``.

    Args:
        db_path: Path to the application SQLite database.
        compiled_json_dir: Directory where compiled JSON files are stored
            (e.g. ``backend/storage/models/dspy/``).

    Returns:
        Absolute path string to the compiled JSON file, or ``None`` if no
        active compiled program is found or the file does not exist on disk.

    Example:
        >>> path = load_compiled_classifier("app.db", "models/dspy/")
        >>> path is None or path.endswith(".json")
        True
    """
    try:
        con = sqlite3.connect(str(db_path))
        row = con.execute(
            "SELECT id, version FROM dspy_compiled_programs "
            "WHERE module_name = ? AND is_active = 1 "
            "ORDER BY version DESC LIMIT 1",
            (MODULE_NAME,),
        ).fetchone()
        con.close()
        if not row:
            return None

        candidate = Path(compiled_json_dir) / f"{MODULE_NAME}_v{row[1]}.json"
        return str(candidate) if candidate.exists() else None
    except Exception as exc:
        logger.warning("load_compiled_classifier: DB lookup failed: %s", exc)
        return None
