"""Tests for backend.embeddings.provider — EmbeddingProvider protocol and implementations.

Covers:
- _cosine_sim() utility (identical, orthogonal, opposite, zero-vector)
- get_provider() factory (valid names, aliases, unknown name raises)
- MiniLMProvider (model_name, embed, embed_batch — all with mocked ST)
- GemmaEmbeddingProvider (model_name, embed, embed_batch, fallback path)
- Protocol compliance (isinstance checks at runtime)

All tests mock sentence_transformers.SentenceTransformer so no real model
download or GPU allocation occurs.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# unittest.mock.patch('sentence_transformers.SentenceTransformer', ...) imports
# the real module to resolve the attribute path, so the package must be present
# even though every test mocks the implementation. CI does not install
# sentence-transformers (it pulls torch + transformers — ~1-2 GB) so skip this
# whole file when the dependency is missing.
pytest.importorskip(
    "sentence_transformers",
    reason="sentence-transformers not installed (CI skips heavy ML deps; full local venv runs these)",
)

# Ensure project root is on sys.path regardless of invocation CWD.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.embeddings.provider import (
    EmbeddingProvider,
    GemmaEmbeddingProvider,
    MiniLMProvider,
    _cosine_sim,
    get_provider,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_model(dim: int = 384) -> MagicMock:
    """Build a MagicMock that behaves like a SentenceTransformer instance.

    Args:
        dim: Dimensionality of fake embedding vectors to return.

    Returns:
        A MagicMock whose ``encode`` method returns a deterministic numpy
        array of shape ``(dim,)`` for a single text, or ``(N, dim)`` for a
        list of texts.  The return value is deterministic (seeded zeros + 1)
        so shape assertions are reliable without random seeds.
    """
    mock = MagicMock()

    def encode_side_effect(text_or_texts, **kwargs):
        if isinstance(text_or_texts, list):
            return np.ones((len(text_or_texts), dim), dtype=np.float32)
        return np.ones(dim, dtype=np.float32)

    mock.encode.side_effect = encode_side_effect
    return mock


def _reset_class_caches() -> None:
    """Clear class-level model caches between tests.

    Both MiniLMProvider and GemmaEmbeddingProvider cache a shared
    SentenceTransformer instance at the class level.  Resetting this
    between tests prevents test ordering from affecting results.
    """
    MiniLMProvider._shared_model = None
    GemmaEmbeddingProvider._shared_model = None


# ---------------------------------------------------------------------------
# _cosine_sim — pure utility, no mocking required
# ---------------------------------------------------------------------------


class TestCosineSim:
    """Unit tests for the _cosine_sim() module-level utility."""

    def test_cosine_similarity_identical(self):
        """Identical vectors should produce a similarity of exactly 1.0.

        For any non-zero vector v, cos(v, v) = ||v||^2 / (||v|| * ||v||) = 1.
        """
        vec = [1.0, 2.0, 3.0]
        result = _cosine_sim(vec, vec)
        assert abs(result - 1.0) < 1e-6

    def test_cosine_similarity_orthogonal(self):
        """Orthogonal vectors should produce a similarity of 0.0.

        [1, 0] and [0, 1] have dot product 0, so cosine similarity = 0.
        """
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        result = _cosine_sim(a, b)
        assert abs(result - 0.0) < 1e-6

    def test_cosine_similarity_opposite(self):
        """A vector and its negation should produce a similarity of -1.0.

        cos(v, -v) = -||v||^2 / (||v|| * ||-v||) = -1.
        """
        vec = [1.0, 2.0, 3.0]
        neg = [-1.0, -2.0, -3.0]
        result = _cosine_sim(vec, neg)
        assert abs(result - (-1.0)) < 1e-6

    def test_cosine_similarity_zero_vector_a(self):
        """Zero magnitude in first vector should return 0.0, not NaN or error."""
        result = _cosine_sim([0.0, 0.0, 0.0], [1.0, 2.0, 3.0])
        assert result == 0.0

    def test_cosine_similarity_zero_vector_b(self):
        """Zero magnitude in second vector should return 0.0, not NaN or error."""
        result = _cosine_sim([1.0, 2.0, 3.0], [0.0, 0.0, 0.0])
        assert result == 0.0

    def test_cosine_similarity_both_zero(self):
        """Both vectors zero should return 0.0."""
        result = _cosine_sim([0.0, 0.0], [0.0, 0.0])
        assert result == 0.0

    def test_cosine_similarity_unit_vectors(self):
        """Unit vectors at 45 degrees should return cos(45°) ≈ 0.707."""
        a = [1.0, 0.0, 0.0]
        b = [1.0, 1.0, 0.0]
        result = _cosine_sim(a, b)
        expected = 1.0 / np.sqrt(2.0)
        assert abs(result - expected) < 1e-5

    def test_cosine_similarity_high_dimensional(self):
        """Identical high-dimensional vectors should still return 1.0."""
        vec = list(range(1, 385))  # 384 dimensions, non-zero
        result = _cosine_sim(vec, vec)
        assert abs(result - 1.0) < 1e-5

    def test_cosine_similarity_range(self):
        """Result must always lie within [-1.0, 1.0]."""
        rng = np.random.default_rng(seed=42)
        for _ in range(20):
            a = rng.standard_normal(64).tolist()
            b = rng.standard_normal(64).tolist()
            result = _cosine_sim(a, b)
            assert -1.0 - 1e-6 <= result <= 1.0 + 1e-6


# ---------------------------------------------------------------------------
# get_provider — factory function
# ---------------------------------------------------------------------------


class TestGetProvider:
    """Unit tests for the get_provider() factory."""

    def test_get_provider_minilm(self):
        """'minilm' should return a MiniLMProvider instance."""
        provider = get_provider("minilm")
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_embeddinggemma(self):
        """'embeddinggemma' should return a GemmaEmbeddingProvider instance."""
        provider = get_provider("embeddinggemma")
        assert isinstance(provider, GemmaEmbeddingProvider)

    def test_get_provider_unknown_raises(self):
        """An unrecognised provider name should raise ValueError."""
        with pytest.raises(ValueError, match="Unknown embedding provider"):
            get_provider("not-a-real-model")

    def test_get_provider_empty_string_raises(self):
        """An empty string should raise ValueError, not silently fall back."""
        with pytest.raises(ValueError):
            get_provider("")

    def test_get_provider_alias_all_minilm_l6_v2(self):
        """Alias 'all-minilm-l6-v2' should resolve to MiniLMProvider."""
        provider = get_provider("all-minilm-l6-v2")
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_alias_minilm_l6_v2(self):
        """Alias 'minilm-l6-v2' should resolve to MiniLMProvider."""
        provider = get_provider("minilm-l6-v2")
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_alias_gemma(self):
        """Alias 'gemma' should resolve to GemmaEmbeddingProvider."""
        provider = get_provider("gemma")
        assert isinstance(provider, GemmaEmbeddingProvider)

    def test_get_provider_alias_full_model_id(self):
        """Full model ID 'google/embeddinggemma-300m' should resolve to GemmaEmbeddingProvider."""
        provider = get_provider("google/embeddinggemma-300m")
        assert isinstance(provider, GemmaEmbeddingProvider)

    def test_get_provider_case_insensitive(self):
        """Provider names should be matched case-insensitively."""
        assert isinstance(get_provider("MiniLM"), MiniLMProvider)
        assert isinstance(get_provider("MINILM"), MiniLMProvider)
        assert isinstance(get_provider("EmbeddingGemma"), GemmaEmbeddingProvider)

    def test_get_provider_whitespace_stripped(self):
        """Leading/trailing whitespace in name should be ignored."""
        provider = get_provider("  minilm  ")
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_none_reads_config(self, tmp_path, monkeypatch):
        """Passing None should read from app.json config, defaulting to 'minilm'."""
        cfg = tmp_path / "app.json"
        cfg.write_text('{"embedding": {"model": "minilm"}}')
        monkeypatch.setattr(
            "backend.embeddings.provider._CONFIG_PATH", cfg
        )
        provider = get_provider(None)
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_none_reads_gemma_from_config(self, tmp_path, monkeypatch):
        """Passing None with embedding.model = 'embeddinggemma' returns GemmaEmbeddingProvider."""
        cfg = tmp_path / "app.json"
        cfg.write_text('{"embedding": {"model": "embeddinggemma"}}')
        monkeypatch.setattr(
            "backend.embeddings.provider._CONFIG_PATH", cfg
        )
        provider = get_provider(None)
        assert isinstance(provider, GemmaEmbeddingProvider)

    def test_get_provider_none_missing_config_defaults_minilm(self, tmp_path, monkeypatch):
        """When app.json is absent, None name should default to MiniLMProvider."""
        monkeypatch.setattr(
            "backend.embeddings.provider._CONFIG_PATH",
            tmp_path / "nonexistent.json",
        )
        provider = get_provider(None)
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_none_invalid_json_defaults_minilm(self, tmp_path, monkeypatch):
        """When app.json is malformed JSON, should default to MiniLMProvider."""
        cfg = tmp_path / "app.json"
        cfg.write_text("{this is not valid json}")
        monkeypatch.setattr(
            "backend.embeddings.provider._CONFIG_PATH", cfg
        )
        provider = get_provider(None)
        assert isinstance(provider, MiniLMProvider)

    def test_get_provider_none_missing_embedding_key_defaults_minilm(self, tmp_path, monkeypatch):
        """When app.json has no 'embedding' key, should default to MiniLMProvider."""
        cfg = tmp_path / "app.json"
        cfg.write_text('{"llm": {"model": "something"}}')
        monkeypatch.setattr(
            "backend.embeddings.provider._CONFIG_PATH", cfg
        )
        provider = get_provider(None)
        assert isinstance(provider, MiniLMProvider)


# ---------------------------------------------------------------------------
# MiniLMProvider
# ---------------------------------------------------------------------------


class TestMiniLMProvider:
    """Unit tests for MiniLMProvider using a mocked SentenceTransformer."""

    def setup_method(self):
        """Reset class-level model cache before each test."""
        _reset_class_caches()

    def test_minilm_model_name(self):
        """model_name should return 'all-MiniLM-L6-v2' without loading the model."""
        p = MiniLMProvider()
        assert p.model_name == "all-MiniLM-L6-v2"

    def test_minilm_embed_returns_list(self):
        """embed() should return a plain list[float] of the correct dimension."""
        mock_model = _make_mock_model(384)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384  # pre-set so _load() is not triggered
            result = p.embed("hello world")

        assert isinstance(result, list)
        assert len(result) == 384
        assert all(isinstance(v, float) for v in result)

    def test_minilm_embed_batch_returns_list_of_lists(self):
        """embed_batch() should return a list of lists with correct shape."""
        mock_model = _make_mock_model(384)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384
            texts = ["one", "two", "three"]
            result = p.embed_batch(texts)

        assert isinstance(result, list)
        assert len(result) == 3
        for row in result:
            assert isinstance(row, list)
            assert len(row) == 384

    def test_minilm_embed_calls_encode(self):
        """embed() should delegate to model.encode() with the raw text."""
        mock_model = _make_mock_model(384)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384
            p.embed("test text")

        mock_model.encode.assert_called_once_with("test text")

    def test_minilm_embed_batch_calls_encode_with_list(self):
        """embed_batch() should pass the full list to model.encode()."""
        mock_model = _make_mock_model(384)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384
            p.embed_batch(["a", "b"])

        mock_model.encode.assert_called_once_with(["a", "b"])

    def test_minilm_dimension_triggers_load(self):
        """Accessing .dimension when _dim is None should trigger lazy load."""
        mock_model = _make_mock_model(384)
        with patch(
            "sentence_transformers.SentenceTransformer", return_value=mock_model
        ):
            p = MiniLMProvider()
            # _dim starts None, _load() must be called
            assert p._dim is None
            dim = p.dimension
            assert dim == 384
            assert p._dim == 384

    def test_minilm_shared_model_reused_across_instances(self):
        """Two MiniLMProvider instances should share the same underlying model."""
        mock_model = _make_mock_model(384)
        with patch(
            "sentence_transformers.SentenceTransformer", return_value=mock_model
        ) as mock_cls:
            p1 = MiniLMProvider()
            p2 = MiniLMProvider()
            # Access dimension on both — SentenceTransformer constructor
            # should only be called once.
            _ = p1.dimension
            _ = p2.dimension

        mock_cls.assert_called_once()

    def test_minilm_cosine_similarity_delegates(self):
        """cosine_similarity() on MiniLMProvider should use _cosine_sim correctly."""
        p = MiniLMProvider()
        a = [1.0, 0.0]
        b = [1.0, 0.0]
        assert abs(p.cosine_similarity(a, b) - 1.0) < 1e-6

    def test_minilm_embed_empty_string(self):
        """embed() should not crash on an empty string input."""
        mock_model = _make_mock_model(384)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384
            result = p.embed("")

        assert isinstance(result, list)
        assert len(result) == 384

    def test_minilm_embed_batch_empty_list(self):
        """embed_batch() on an empty list should return an empty list."""
        mock_model = MagicMock()
        # numpy array with shape (0, 384) — tolist() returns []
        mock_model.encode.return_value = np.ones((0, 384), dtype=np.float32)
        with patch(
            "backend.embeddings.provider.MiniLMProvider._shared_model", mock_model
        ):
            p = MiniLMProvider()
            p._dim = 384
            result = p.embed_batch([])

        assert result == []


# ---------------------------------------------------------------------------
# GemmaEmbeddingProvider
# ---------------------------------------------------------------------------


class TestGemmaEmbeddingProvider:
    """Unit tests for GemmaEmbeddingProvider using a mocked SentenceTransformer."""

    def setup_method(self):
        """Reset class-level model caches before each test."""
        _reset_class_caches()

    def test_gemma_model_name_before_load(self):
        """model_name should return 'google/embeddinggemma-300m' before any load."""
        p = GemmaEmbeddingProvider()
        assert p.model_name == "google/embeddinggemma-300m"

    def test_gemma_model_name_no_fallback(self):
        """model_name should return Gemma ID when fallback is not active."""
        p = GemmaEmbeddingProvider()
        # No load triggered, no fallback set
        assert p._fallback is None
        assert p.model_name == "google/embeddinggemma-300m"

    def test_gemma_embed_returns_list(self):
        """embed() should return a plain list[float] of the correct dimension."""
        mock_model = _make_mock_model(768)
        with patch(
            "backend.embeddings.provider.GemmaEmbeddingProvider._shared_model",
            mock_model,
        ):
            p = GemmaEmbeddingProvider()
            p._dim = 768
            result = p.embed("test sentence")

        assert isinstance(result, list)
        assert len(result) == 768
        assert all(isinstance(v, float) for v in result)

    def test_gemma_embed_uses_prompt_name(self):
        """embed() should pass prompt_name to model.encode()."""
        mock_model = _make_mock_model(768)
        with patch(
            "backend.embeddings.provider.GemmaEmbeddingProvider._shared_model",
            mock_model,
        ):
            p = GemmaEmbeddingProvider(prompt_name="Clustering")
            p._dim = 768
            p.embed("cluster me")

        mock_model.encode.assert_called_once_with(
            "cluster me", prompt_name="Clustering"
        )

    def test_gemma_embed_batch_returns_list_of_lists(self):
        """embed_batch() should return a list of lists with correct shape."""
        mock_model = _make_mock_model(768)
        with patch(
            "backend.embeddings.provider.GemmaEmbeddingProvider._shared_model",
            mock_model,
        ):
            p = GemmaEmbeddingProvider()
            p._dim = 768
            result = p.embed_batch(["x", "y", "z"])

        assert isinstance(result, list)
        assert len(result) == 3
        for row in result:
            assert len(row) == 768

    def test_gemma_fallback_on_load_error(self):
        """When SentenceTransformer raises on load, GemmaProvider should fall back to MiniLM.

        Verifies:
        - self._fallback is set to a MiniLMProvider instance
        - embed() / embed_batch() delegate to the fallback
        - model_name returns the MiniLM model name after fallback
        """
        # The MiniLM fallback also calls SentenceTransformer — we need a
        # fresh mock that succeeds for MiniLM after failing for Gemma.
        mock_minilm_model = _make_mock_model(384)
        call_count = 0

        def st_side_effect(model_id, **kwargs):
            nonlocal call_count
            call_count += 1
            if "gemma" in model_id.lower():
                raise OSError("Simulated network/memory failure")
            # Second call is from MiniLM fallback
            return mock_minilm_model

        with patch("sentence_transformers.SentenceTransformer", side_effect=st_side_effect):
            p = GemmaEmbeddingProvider()
            # Trigger _load() by accessing dimension
            dim = p.dimension

        assert p._fallback is not None
        assert isinstance(p._fallback, MiniLMProvider)
        assert dim == 384
        assert p.model_name == "all-MiniLM-L6-v2"

    def test_gemma_fallback_embed_delegates_to_minilm(self):
        """After fallback activation, embed() should return MiniLM output."""
        mock_minilm_model = _make_mock_model(384)

        def st_side_effect(model_id, **kwargs):
            if "gemma" in model_id.lower():
                raise RuntimeError("load error")
            return mock_minilm_model

        with patch("sentence_transformers.SentenceTransformer", side_effect=st_side_effect):
            p = GemmaEmbeddingProvider()
            _ = p.dimension  # trigger fallback
            result = p.embed("fallback test")

        assert isinstance(result, list)
        assert len(result) == 384

    def test_gemma_fallback_embed_batch_delegates_to_minilm(self):
        """After fallback activation, embed_batch() should return MiniLM output."""
        mock_minilm_model = _make_mock_model(384)

        def st_side_effect(model_id, **kwargs):
            if "gemma" in model_id.lower():
                raise RuntimeError("load error")
            return mock_minilm_model

        with patch("sentence_transformers.SentenceTransformer", side_effect=st_side_effect):
            p = GemmaEmbeddingProvider()
            _ = p.dimension
            result = p.embed_batch(["a", "b"])

        assert isinstance(result, list)
        assert len(result) == 2

    def test_gemma_cosine_similarity_delegates(self):
        """cosine_similarity() on GemmaProvider should use _cosine_sim."""
        p = GemmaEmbeddingProvider()
        a = [0.0, 1.0]
        b = [1.0, 0.0]
        assert abs(p.cosine_similarity(a, b) - 0.0) < 1e-6

    def test_gemma_dimension_auto_detected_from_probe(self):
        """dimension should be inferred by probing the loaded model, not hard-coded."""
        # Use a 512-dim model to show it reads actual encode output, not a constant.
        mock_model = _make_mock_model(512)
        with patch(
            "sentence_transformers.SentenceTransformer", return_value=mock_model
        ):
            p = GemmaEmbeddingProvider()
            assert p._dim is None
            assert p.dimension == 512

    def test_gemma_default_prompt_name_is_retrieval(self):
        """Default prompt_name should be 'Retrieval'."""
        p = GemmaEmbeddingProvider()
        assert p._prompt_name == "Retrieval"

    def test_gemma_custom_prompt_name(self):
        """Custom prompt_name passed to constructor should be preserved."""
        p = GemmaEmbeddingProvider(prompt_name="Classification")
        assert p._prompt_name == "Classification"


# ---------------------------------------------------------------------------
# Protocol compliance
# ---------------------------------------------------------------------------


class TestProviderProtocolCompliance:
    """Verify that concrete providers satisfy the EmbeddingProvider Protocol.

    Uses isinstance() which is enabled by @runtime_checkable.
    The isinstance check against a Protocol only validates that the
    required methods/properties are present, not their signatures.
    """

    def test_minilm_is_embedding_provider(self):
        """MiniLMProvider must satisfy the EmbeddingProvider Protocol at runtime."""
        p = MiniLMProvider()
        assert isinstance(p, EmbeddingProvider)

    def test_gemma_is_embedding_provider(self):
        """GemmaEmbeddingProvider must satisfy the EmbeddingProvider Protocol at runtime."""
        p = GemmaEmbeddingProvider()
        assert isinstance(p, EmbeddingProvider)

    def test_plain_dict_is_not_embedding_provider(self):
        """An arbitrary dict must NOT satisfy the EmbeddingProvider Protocol."""
        assert not isinstance({}, EmbeddingProvider)

    def test_minilm_has_required_attributes(self):
        """MiniLMProvider must expose dimension, model_name, embed, embed_batch, cosine_similarity."""
        p = MiniLMProvider()
        assert hasattr(p, "dimension")
        assert hasattr(p, "model_name")
        assert callable(p.embed)
        assert callable(p.embed_batch)
        assert callable(p.cosine_similarity)

    def test_gemma_has_required_attributes(self):
        """GemmaEmbeddingProvider must expose dimension, model_name, embed, embed_batch, cosine_similarity."""
        p = GemmaEmbeddingProvider()
        assert hasattr(p, "dimension")
        assert hasattr(p, "model_name")
        assert callable(p.embed)
        assert callable(p.embed_batch)
        assert callable(p.cosine_similarity)
