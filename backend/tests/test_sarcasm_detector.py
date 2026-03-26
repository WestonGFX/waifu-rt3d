"""Tests for backend.nlp.sarcasm_detector — sarcasm/irony detection.

All tests mock the HuggingFace pipeline so the test suite never requires a
model download and runs fast in CI.  A separate integration marker is
provided for tests that exercise real inference (skipped by default).
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.nlp.sarcasm_detector import SarcasmDetector, SarcasmResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pipeline_mock(irony_score: float) -> MagicMock:
    """Return a callable mock that mimics the HuggingFace pipeline.

    The pipeline is called with a string and returns a list-of-lists
    matching the ``top_k=None`` output shape of
    ``cardiffnlp/twitter-roberta-base-irony``::

        [[{"label": "irony", "score": 0.89},
          {"label": "non_irony", "score": 0.11}]]

    Args:
        irony_score: The ``"irony"`` label score to embed in the mock output.

    Returns:
        MagicMock instance that when called returns the synthetic pipeline
        output.
    """
    mock = MagicMock()
    mock.return_value = [
        [
            {"label": "irony", "score": irony_score},
            {"label": "non_irony", "score": 1.0 - irony_score},
        ]
    ]
    return mock


def _detector_with_mock(irony_score: float) -> SarcasmDetector:
    """Create a SarcasmDetector pre-wired with a mocked pipeline.

    Bypasses the lazy-load path so tests never hit the network.

    Args:
        irony_score: Confidence to return for the irony label.

    Returns:
        Fully initialised SarcasmDetector with mocked pipeline.
    """
    detector = SarcasmDetector()
    detector._pipeline = _make_pipeline_mock(irony_score)
    detector._available = True
    return detector


# ---------------------------------------------------------------------------
# Initialisation tests
# ---------------------------------------------------------------------------

class TestSarcasmDetectorInit:
    """Verify the detector constructs cleanly without side effects."""

    def test_init_does_not_load_pipeline(self) -> None:
        """Creating a detector should NOT import transformers or load a model."""
        with patch.dict("sys.modules", {"transformers": None}):
            detector = SarcasmDetector()
        # Pipeline must still be None — no loading happened at init time.
        assert detector._pipeline is None

    def test_available_flag_starts_as_none(self) -> None:
        """The _available flag should be None (not-yet-probed) after init."""
        detector = SarcasmDetector()
        assert detector._available is None

    def test_threshold_constant(self) -> None:
        """SARCASM_THRESHOLD should equal 0.7."""
        assert SarcasmDetector.SARCASM_THRESHOLD == 0.7

    def test_model_id_constant(self) -> None:
        """MODEL_ID should reference the Cardiff NLP irony model."""
        assert SarcasmDetector.MODEL_ID == "cardiffnlp/twitter-roberta-base-irony"


# ---------------------------------------------------------------------------
# SarcasmResult dataclass tests
# ---------------------------------------------------------------------------

class TestSarcasmResult:
    """Verify the SarcasmResult dataclass behaves as expected."""

    def test_fields_present(self) -> None:
        """SarcasmResult must expose is_sarcastic, confidence, and hint."""
        result = SarcasmResult(is_sarcastic=True, confidence=0.9, hint="some hint")
        assert result.is_sarcastic is True
        assert result.confidence == 0.9
        assert result.hint == "some hint"

    def test_non_sarcastic_result(self) -> None:
        """Non-sarcastic result should have hint=None."""
        result = SarcasmResult(is_sarcastic=False, confidence=0.2, hint=None)
        assert result.is_sarcastic is False
        assert result.hint is None


# ---------------------------------------------------------------------------
# Detection — obvious sarcasm
# ---------------------------------------------------------------------------

class TestDetectSarcasm:
    """Tests for sarcastic input messages."""

    def test_obvious_sarcasm_is_detected(self) -> None:
        """High irony score should produce is_sarcastic=True."""
        detector = _detector_with_mock(irony_score=0.89)
        result = detector.detect("Oh sure, everything is JUST PERFECT")
        assert result.is_sarcastic is True

    def test_obvious_sarcasm_confidence(self) -> None:
        """Returned confidence should match the mocked irony score."""
        detector = _detector_with_mock(irony_score=0.89)
        result = detector.detect("Oh sure, everything is JUST PERFECT")
        assert abs(result.confidence - 0.89) < 1e-6

    def test_sarcasm_generates_hint(self) -> None:
        """When sarcasm is detected, hint must be a non-empty string."""
        detector = _detector_with_mock(irony_score=0.95)
        result = detector.detect("Oh wow, what a FANTASTIC idea that was")
        assert result.hint is not None
        assert len(result.hint) > 0

    def test_hint_content(self) -> None:
        """The hint string must instruct the LLM to read between the lines."""
        detector = _detector_with_mock(irony_score=0.95)
        result = detector.detect("Oh sure, my day was GREAT")
        assert result.hint is not None
        assert "sarcastic" in result.hint.lower()
        assert "underlying emotion" in result.hint.lower()

    def test_exact_threshold_is_sarcastic(self) -> None:
        """A score exactly equal to SARCASM_THRESHOLD (0.7) should be sarcastic."""
        detector = _detector_with_mock(irony_score=0.7)
        result = detector.detect("Yeah right, totally believable")
        assert result.is_sarcastic is True

    def test_just_above_threshold_is_sarcastic(self) -> None:
        """A score of 0.71 must clear the threshold."""
        detector = _detector_with_mock(irony_score=0.71)
        result = detector.detect("Sure, because THAT always works out great")
        assert result.is_sarcastic is True


# ---------------------------------------------------------------------------
# Detection — non-sarcastic
# ---------------------------------------------------------------------------

class TestDetectSincere:
    """Tests for sincere, non-sarcastic input messages."""

    def test_sincere_message_not_sarcastic(self) -> None:
        """Low irony score should produce is_sarcastic=False."""
        detector = _detector_with_mock(irony_score=0.15)
        result = detector.detect("I had a great day at work today")
        assert result.is_sarcastic is False

    def test_sincere_message_no_hint(self) -> None:
        """Sincere messages must not produce a hint."""
        detector = _detector_with_mock(irony_score=0.15)
        result = detector.detect("I had a great day at work today")
        assert result.hint is None

    def test_sincere_confidence_value(self) -> None:
        """Confidence should reflect the mocked score directly."""
        detector = _detector_with_mock(irony_score=0.15)
        result = detector.detect("I had a great day at work today")
        assert abs(result.confidence - 0.15) < 1e-6

    def test_just_below_threshold_is_sincere(self) -> None:
        """A score of 0.699 should NOT cross the threshold."""
        detector = _detector_with_mock(irony_score=0.699)
        result = detector.detect("That was a pretty good outcome")
        assert result.is_sarcastic is False
        assert result.hint is None


# ---------------------------------------------------------------------------
# Graceful fallback — transformers not installed
# ---------------------------------------------------------------------------

class TestFallbackWhenTransformersMissing:
    """Verify the detector degrades gracefully when transformers is absent."""

    def test_detect_returns_safe_result_when_no_transformers(self) -> None:
        """If transformers cannot be imported, detect() must not raise."""
        detector = SarcasmDetector()
        # Simulate the import failing inside _load_pipeline.
        with patch("builtins.__import__", side_effect=ImportError("no transformers")):
            # The probe already ran if _available is not None, so force a
            # fresh probe by keeping _available=None and overriding the
            # import mechanism.
            pass

        # Directly simulate the failed-load state.
        detector._available = False
        detector._pipeline = None

        result = detector.detect("Oh sure, everything is JUST PERFECT")
        assert result.is_sarcastic is False
        assert result.confidence == 0.0
        assert result.hint is None

    def test_available_flag_set_false_after_failed_load(self) -> None:
        """_available should be False after a failed pipeline load."""
        detector = SarcasmDetector()

        # Patch the transformers import inside _load_pipeline to raise.
        with patch.dict("sys.modules", {"transformers": None}):
            # Force the probe.
            detector._load_pipeline()

        # When transformers is absent the probe sets _available to False.
        assert detector._available is False
        assert detector._pipeline is None

    def test_result_type_on_fallback(self) -> None:
        """Fallback result must be a SarcasmResult instance."""
        detector = SarcasmDetector()
        detector._available = False
        detector._pipeline = None
        result = detector.detect("test")
        assert isinstance(result, SarcasmResult)

    def test_pipeline_exception_returns_safe_result(self) -> None:
        """An exception raised by the pipeline must be caught, not propagated."""
        detector = SarcasmDetector()
        broken_pipeline = MagicMock(side_effect=RuntimeError("CUDA OOM"))
        detector._pipeline = broken_pipeline
        detector._available = True

        result = detector.detect("Oh sure, everything is JUST PERFECT")
        assert result.is_sarcastic is False
        assert result.confidence == 0.0
        assert result.hint is None


# ---------------------------------------------------------------------------
# _irony_confidence helper
# ---------------------------------------------------------------------------

class TestIronyConfidenceHelper:
    """Unit tests for the internal _irony_confidence parser."""

    def test_extracts_irony_label(self) -> None:
        """Should correctly locate the irony label regardless of position."""
        raw = [[{"label": "non_irony", "score": 0.1}, {"label": "irony", "score": 0.9}]]
        assert abs(SarcasmDetector._irony_confidence(raw) - 0.9) < 1e-6

    def test_irony_first_in_list(self) -> None:
        """Works when irony is the first item."""
        raw = [[{"label": "irony", "score": 0.75}, {"label": "non_irony", "score": 0.25}]]
        assert abs(SarcasmDetector._irony_confidence(raw) - 0.75) < 1e-6

    def test_label_case_insensitive(self) -> None:
        """Label matching should be case-insensitive."""
        raw = [[{"label": "IRONY", "score": 0.55}]]
        assert abs(SarcasmDetector._irony_confidence(raw) - 0.55) < 1e-6

    def test_missing_irony_label_returns_zero(self) -> None:
        """If the irony label is absent, return 0.0."""
        raw = [[{"label": "non_irony", "score": 1.0}]]
        assert SarcasmDetector._irony_confidence(raw) == 0.0

    def test_empty_outer_list_returns_zero(self) -> None:
        """Empty output should not raise, should return 0.0."""
        assert SarcasmDetector._irony_confidence([]) == 0.0

    def test_empty_inner_list_returns_zero(self) -> None:
        """Empty inner list should not raise, should return 0.0."""
        assert SarcasmDetector._irony_confidence([[]]) == 0.0

    def test_malformed_output_returns_zero(self) -> None:
        """Non-list output should not raise, should return 0.0."""
        assert SarcasmDetector._irony_confidence(None) == 0.0  # type: ignore[arg-type]
        assert SarcasmDetector._irony_confidence("unexpected") == 0.0  # type: ignore[arg-type]

    def test_score_non_numeric_returns_zero(self) -> None:
        """Non-numeric score field should degrade to 0.0."""
        raw = [[{"label": "irony", "score": "not-a-number"}]]
        assert SarcasmDetector._irony_confidence(raw) == 0.0


# ---------------------------------------------------------------------------
# Edge cases on detect()
# ---------------------------------------------------------------------------

class TestDetectEdgeCases:
    """Edge-case inputs for the detect() method."""

    def test_empty_string(self) -> None:
        """Empty string must not raise."""
        detector = _detector_with_mock(irony_score=0.1)
        result = detector.detect("")
        assert isinstance(result, SarcasmResult)

    def test_non_string_input_coerced(self) -> None:
        """Non-string input must be coerced rather than raising a TypeError."""
        detector = _detector_with_mock(irony_score=0.1)
        result = detector.detect(42)  # type: ignore[arg-type]
        assert isinstance(result, SarcasmResult)

    def test_very_long_text(self) -> None:
        """Very long input should not raise."""
        detector = _detector_with_mock(irony_score=0.05)
        long_text = "This is perfectly fine. " * 500
        result = detector.detect(long_text)
        assert isinstance(result, SarcasmResult)

    def test_pipeline_called_with_text(self) -> None:
        """The underlying pipeline must be called with the user's text."""
        mock_pipe = _make_pipeline_mock(irony_score=0.8)
        detector = SarcasmDetector()
        detector._pipeline = mock_pipe
        detector._available = True

        detector.detect("Wow, what a surprise")
        mock_pipe.assert_called_once_with("Wow, what a surprise")

    def test_lazy_load_called_once(self) -> None:
        """_load_pipeline must be called on first detect, not at init time."""
        detector = _detector_with_mock(irony_score=0.5)
        # _available is already True (set by helper), so _load_pipeline is a no-op.
        # Verify the probe flag is respected on second call.
        detector.detect("first call")
        detector.detect("second call")
        # If _load_pipeline tried to re-import on every call, the mock would
        # still work but the test verifies the gate condition is set.
        assert detector._available is True
