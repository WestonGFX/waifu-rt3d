"""Toxicity detection for user messages.

Uses a lightweight DistilBERT-based classifier to detect toxic, hateful, or
harmful content in text.  When detected the caller can enforce content
boundaries, log the event, or modify the character's response posture.

The model (``martin-ha/toxic-comment-model``) is loaded lazily on first call
to :meth:`ToxicityDetector.detect` so that import time stays negligible.  If
``transformers`` is not installed, every call falls back to a deterministic
keyword-based heuristic — the rest of the application continues to work
without modification.

Typical usage::

    detector = ToxicityDetector()
    result = detector.detect("You should just go away forever")
    if result.is_toxic:
        # enforce boundary or alter response
        print(result.confidence, result.categories)
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Keyword fallback list
# Focused on genuinely harmful content only — NOT mere profanity.
# This is an adult-content-capable app; the list targets threats, hate speech,
# and self-harm incitement rather than strong language.
# ---------------------------------------------------------------------------

_TOXIC_KEYWORDS: frozenset[str] = frozenset(
    {
        "kill yourself",
        "kys",
        "go kill yourself",
        "you should die",
        "i hope you die",
        "hope you die",
        "i want you dead",
        "i will kill you",
        "i'm going to kill you",
        "im going to kill you",
        "shoot yourself",
        "hang yourself",
        "cut yourself",
        "slit your wrists",
        "end your life",
        "worthless piece of",
        "die in a fire",
        "i hate your kind",
        "you people deserve to",
        "bomb threat",
    }
)


def _keyword_fallback(text: str) -> "ToxicityResult":
    """Classify *text* using a static keyword list.

    Used when ``transformers`` is unavailable or the model fails to load.
    The list targets threats and self-harm incitement only — not profanity —
    because the platform is adult-content-capable.

    Args:
        text: The user message to inspect.

    Returns:
        :class:`ToxicityResult` with ``confidence=0.8`` on a keyword hit or
        ``confidence=0.9`` on a clean result (high confidence non-toxic).

    Example:
        >>> r = _keyword_fallback("you should die")
        >>> r.is_toxic
        True
        >>> r.categories
        ['keyword_match']
    """
    text_lower = text.lower()
    for keyword in _TOXIC_KEYWORDS:
        if keyword in text_lower:
            return ToxicityResult(
                is_toxic=True,
                confidence=0.8,
                label="toxic",
                categories=["keyword_match"],
            )
    return ToxicityResult(
        is_toxic=False,
        confidence=0.9,
        label="non-toxic",
        categories=[],
    )


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------


@dataclass
class ToxicityResult:
    """Result of toxicity analysis on a text message.

    Attributes:
        is_toxic: True when the classifier confidence equals or exceeds
            :attr:`ToxicityDetector.TOXICITY_THRESHOLD`.
        confidence: Raw classifier confidence in the *toxic* label, in the
            range [0.0, 1.0].
        label: Human-readable classification — ``"toxic"`` or
            ``"non-toxic"``.
        categories: Sub-categories when the model supports multi-label
            output (e.g. ``["insult", "threat"]``).  Falls back to
            ``["keyword_match"]`` for the heuristic path, or ``[]`` when the
            model only provides a binary label.

    Example:
        >>> result = ToxicityResult(
        ...     is_toxic=True, confidence=0.92,
        ...     label="toxic", categories=["threat"]
        ... )
        >>> result.is_toxic
        True
    """

    is_toxic: bool
    confidence: float
    label: str
    categories: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class ToxicityDetector:
    """Lightweight toxicity classifier for content boundary detection.

    Lazy-loads a DistilBERT-based model (``martin-ha/toxic-comment-model``)
    on first call to :meth:`detect`.  The pipeline is cached on the instance
    for subsequent calls, making inference stateless and thread-safe.

    If ``transformers`` is not installed or the model cannot be fetched,
    the detector silently degrades to a keyword-based heuristic so that the
    rest of the application is never broken by an optional dependency.

    Class Attributes:
        TOXICITY_THRESHOLD: Minimum classifier confidence required to mark a
            message as toxic (default ``0.7``).
        MODEL_ID: HuggingFace model identifier used by the pipeline.

    Example:
        >>> detector = ToxicityDetector()
        >>> result = detector.detect("I hope you have a great day")
        >>> result.is_toxic
        False

        >>> result = detector.detect("you should kill yourself")
        >>> result.is_toxic
        True
    """

    TOXICITY_THRESHOLD: float = 0.7
    MODEL_ID: str = "martin-ha/toxic-comment-model"

    def __init__(
        self,
        model_id: str = "martin-ha/toxic-comment-model",
        device: str = "cpu",
    ) -> None:
        """Initialise the detector without loading any model.

        The HuggingFace pipeline is deferred to the first call of
        :meth:`detect`.  Subsequent calls reuse the cached pipeline.

        Args:
            model_id: HuggingFace model identifier to load.  Defaults to
                ``"martin-ha/toxic-comment-model"``.
            device: PyTorch device string passed to the pipeline (e.g.
                ``"cpu"``, ``"cuda"``, ``"mps"``).  Defaults to ``"cpu"``
                for broad compatibility.
        """
        self.MODEL_ID = model_id
        self._device = device
        self._pipeline: object | None = None
        self._available: bool | None = None  # None = not yet probed
        # Lock ensures the pipeline is initialised only once even under
        # concurrent first-call scenarios.
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_pipeline(self) -> None:
        """Attempt to load the HuggingFace text-classification pipeline.

        Uses a double-checked locking pattern so that the (potentially slow)
        model download only happens once per instance, even when multiple
        threads call :meth:`detect` simultaneously.

        Sets ``self._available`` to ``True`` on success or ``False`` when
        either ``transformers`` is missing or the model cannot be loaded.
        """
        # Fast path — already probed, no lock needed.
        if self._available is not None:
            return

        with self._lock:
            # Re-check inside the lock to handle the race where two threads
            # both pass the fast-path check.
            if self._available is not None:
                return

            try:
                from transformers import pipeline  # type: ignore[import-untyped]

                self._pipeline = pipeline(
                    "text-classification",
                    model=self.MODEL_ID,
                    device=self._device,
                    top_k=None,  # return scores for all labels
                )
                self._available = True
            except Exception:  # noqa: BLE001 — broad catch is intentional
                # transformers not installed, model download failed, OOM, …
                self._pipeline = None
                self._available = False

    @staticmethod
    def _toxic_confidence(raw_output: object) -> tuple[float, list[str]]:
        """Extract the toxic-label confidence and any sub-categories.

        The ``martin-ha/toxic-comment-model`` returns two labels:
        ``"toxic"`` and ``"non-toxic"``.  This helper locates the toxic
        entry regardless of list ordering and returns both the confidence
        score and any additional category strings present in the output.

        Args:
            raw_output: Direct return value of calling the pipeline on a
                string.  Expected shape:
                ``[[{"label": str, "score": float}, …]]``

        Returns:
            A tuple of ``(confidence, categories)`` where *confidence* is
            the float score for the toxic label (``0.0`` if not found) and
            *categories* is a list of any additional label strings that
            exceed the toxicity threshold.

        Example:
            >>> # Simulated pipeline output
            >>> raw = [[{"label": "toxic", "score": 0.95},
            ...         {"label": "non-toxic", "score": 0.05}]]
            >>> conf, cats = ToxicityDetector._toxic_confidence(raw)
            >>> conf
            0.95
        """
        try:
            results: list[dict[str, object]] = raw_output[0]  # type: ignore[index]
            toxic_score = 0.0
            categories: list[str] = []

            for item in results:
                label = item.get("label")
                score = item.get("score", 0.0)
                if not isinstance(label, str):
                    continue
                score_f = float(score) if isinstance(score, (int, float)) else 0.0
                label_lower = label.lower()

                if label_lower == "toxic":
                    toxic_score = score_f
                elif label_lower not in ("non-toxic", "non_toxic") and score_f >= 0.5:
                    # Multi-label models (e.g. toxic-bert) emit extra category
                    # labels; collect those that fire above chance.
                    categories.append(label_lower)

            return toxic_score, categories
        except (IndexError, TypeError, KeyError, AttributeError):
            return 0.0, []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, text: str) -> ToxicityResult:
        """Classify *text* as toxic or non-toxic.

        If ``transformers`` is not installed or the model failed to load,
        delegates to :func:`_keyword_fallback` so that callers always
        receive a valid :class:`ToxicityResult` without handling exceptions.

        Args:
            text: The user's message to analyse.  Non-string values are
                coerced to strings defensively.

        Returns:
            :class:`ToxicityResult` with populated fields.

        Example:
            >>> detector = ToxicityDetector()
            >>> result = detector.detect("Have a wonderful day!")
            >>> result.is_toxic
            False
            >>> result.label
            'non-toxic'

            >>> result = detector.detect("kill yourself")
            >>> result.is_toxic
            True
        """
        self._load_pipeline()

        # Coerce input to string defensively.
        safe_text = str(text) if not isinstance(text, str) else text

        if not self._available or self._pipeline is None:
            return _keyword_fallback(safe_text)

        try:
            raw = self._pipeline(safe_text)  # type: ignore[operator]
        except Exception:  # noqa: BLE001
            return _keyword_fallback(safe_text)

        confidence, categories = self._toxic_confidence(raw)
        is_toxic = confidence >= self.TOXICITY_THRESHOLD
        label = "toxic" if is_toxic else "non-toxic"

        return ToxicityResult(
            is_toxic=is_toxic,
            confidence=confidence,
            label=label,
            categories=categories,
        )
