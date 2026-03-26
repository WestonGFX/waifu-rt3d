"""Sarcasm and irony detection for user messages.

Uses a lightweight RoBERTa-based classifier to detect sarcasm in text.
When detected, injects a hint into the LLM context so the character
responds to the underlying emotion, not the literal words.

The model (``cardiffnlp/twitter-roberta-base-irony``) is loaded lazily on
first call to :meth:`SarcasmDetector.detect` so that import time stays
negligible.  If ``transformers`` is not installed, every call returns a
safe no-op :class:`SarcasmResult` — the rest of the application continues
to work without modification.

Typical usage::

    detector = SarcasmDetector()
    result = detector.detect("Oh sure, my day was GREAT")
    if result.is_sarcastic:
        # inject result.hint into the LLM system prompt
        ...
"""

from __future__ import annotations

from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

@dataclass
class SarcasmResult:
    """Result returned by :meth:`SarcasmDetector.detect`.

    Attributes:
        is_sarcastic: True when the classifier confidence exceeds
            :attr:`SarcasmDetector.SARCASM_THRESHOLD`.
        confidence: Raw classifier confidence in the *irony* label, in the
            range [0.0, 1.0].
        hint: A ready-to-inject system-prompt string when ``is_sarcastic``
            is True, otherwise ``None``.

    Example:
        >>> result = SarcasmResult(is_sarcastic=True, confidence=0.89,
        ...     hint="[The user appears to be sarcastic...]")
        >>> result.is_sarcastic
        True
    """

    is_sarcastic: bool
    confidence: float
    hint: str | None


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class SarcasmDetector:
    """Detects sarcasm/irony in a single text string.

    The underlying HuggingFace pipeline is created on first call to
    :meth:`detect` (lazy loading) so that importing this module is cheap.
    The pipeline is cached on the instance for subsequent calls.

    If ``transformers`` is not importable, the detector operates in
    *passthrough* mode: every call to :meth:`detect` returns a
    :class:`SarcasmResult` with ``is_sarcastic=False`` and
    ``confidence=0.0``.

    Class Attributes:
        SARCASM_THRESHOLD: Minimum classifier confidence required to
            classify a message as sarcastic (default 0.7).
        MODEL_ID: HuggingFace model identifier used by the pipeline.
        _HINT_TEXT: The system-prompt hint injected when sarcasm is
            detected.

    Example:
        >>> detector = SarcasmDetector()
        >>> result = detector.detect("Oh sure, my day was GREAT")
        >>> result.is_sarcastic
        True
        >>> result.confidence
        0.89
    """

    SARCASM_THRESHOLD: float = 0.7
    MODEL_ID: str = "cardiffnlp/twitter-roberta-base-irony"
    _HINT_TEXT: str = (
        "[The user appears to be sarcastic. Read between the lines and "
        "respond to their actual underlying emotion, not the literal words.]"
    )

    def __init__(self) -> None:
        """Initialise the detector.

        The HuggingFace pipeline is NOT loaded here; it is deferred to the
        first call of :meth:`detect`.
        """
        self._pipeline: object | None = None
        self._available: bool | None = None  # None = not yet probed

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_pipeline(self) -> None:
        """Attempt to load the HuggingFace text-classification pipeline.

        Sets ``self._available`` to ``True`` on success or ``False`` when
        either ``transformers`` is missing or the model cannot be loaded.
        The result is cached so the probe runs only once per instance.
        """
        if self._available is not None:
            # Already probed — nothing to do.
            return

        try:
            from transformers import pipeline  # type: ignore[import-untyped]

            self._pipeline = pipeline(
                "text-classification",
                model=self.MODEL_ID,
                top_k=None,  # return scores for all labels
            )
            self._available = True
        except Exception:  # noqa: BLE001 — broad catch is intentional
            # transformers not installed, model download failed, CUDA OOM, …
            self._pipeline = None
            self._available = False

    @staticmethod
    def _irony_confidence(raw_output: object) -> float:
        """Extract the confidence for the *irony* label from pipeline output.

        The ``cardiffnlp/twitter-roberta-base-irony`` model returns two
        labels: ``"irony"`` and ``"non_irony"``.  This helper locates the
        irony entry regardless of list ordering.

        Args:
            raw_output: The direct return value of calling the pipeline on a
                string.  Expected shape: ``[[{"label": str, "score": float}, …]]``

        Returns:
            Confidence float for the irony label, or ``0.0`` if the label is
            not found or the output has an unexpected shape.
        """
        # pipeline(top_k=None) returns a list-of-lists: [[{label, score}, …]]
        try:
            results: list[dict[str, object]] = raw_output[0]  # type: ignore[index]
            for item in results:
                if isinstance(item.get("label"), str):
                    if item["label"].lower() == "irony":
                        score = item.get("score", 0.0)
                        return float(score) if isinstance(score, (int, float)) else 0.0
        except (IndexError, TypeError, KeyError, AttributeError):
            pass
        return 0.0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, text: str) -> SarcasmResult:
        """Classify ``text`` as sarcastic or sincere.

        If ``transformers`` is not installed or the model failed to load,
        returns a safe no-op result (``is_sarcastic=False``,
        ``confidence=0.0``, ``hint=None``) so callers never need to handle
        an exception from this method.

        Args:
            text: The user's message text.  Non-string values are coerced
                to strings to avoid crashes on unexpected input.

        Returns:
            :class:`SarcasmResult` with populated fields.  ``hint`` is
            non-``None`` only when ``is_sarcastic`` is ``True``.

        Example:
            >>> detector = SarcasmDetector()
            >>> result = detector.detect("Oh sure, everything is JUST PERFECT")
            >>> result.is_sarcastic
            True
            >>> result.hint is not None
            True

            >>> result = detector.detect("I had a great day at work today")
            >>> result.is_sarcastic
            False
            >>> result.hint is None
            True
        """
        self._load_pipeline()

        if not self._available or self._pipeline is None:
            return SarcasmResult(is_sarcastic=False, confidence=0.0, hint=None)

        # Coerce input to string defensively.
        safe_text = str(text) if not isinstance(text, str) else text

        try:
            raw = self._pipeline(safe_text)  # type: ignore[operator]
        except Exception:  # noqa: BLE001
            return SarcasmResult(is_sarcastic=False, confidence=0.0, hint=None)

        confidence = self._irony_confidence(raw)
        is_sarcastic = confidence >= self.SARCASM_THRESHOLD
        hint = self._HINT_TEXT if is_sarcastic else None

        return SarcasmResult(
            is_sarcastic=is_sarcastic,
            confidence=confidence,
            hint=hint,
        )
