"""Embedding provider protocol and implementations.

Abstracts text embedding models behind a common interface so consumers
(TieredMemoryManager, LoreMatcher, etc.) can swap models without code
changes.  Provider selection is driven by ``backend/config/app.json``
key ``embedding.model``.

Supported providers:

    +-----------------+--------------------+--------+--------------------+
    | Name            | Model ID           | Dim    | Speed (M2 Pro)     |
    +-----------------+--------------------+--------+--------------------+
    | ``minilm``      | all-MiniLM-L6-v2   | 384    | ~5 ms / embed      |
    | ``embeddinggemma`` | google/embeddinggemma-300m | auto | ~15-30 ms |
    +-----------------+--------------------+--------+--------------------+

Usage::

    from backend.embeddings.provider import get_provider

    provider = get_provider()  # reads config, defaults to "minilm"
    vec = provider.embed("user likes ramen")
    assert len(vec) == provider.dimension

    batch = provider.embed_batch(["hello", "world"])
    assert len(batch) == 2
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config path (relative to project root)
# ---------------------------------------------------------------------------
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "app.json"


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Interface that all embedding providers must satisfy.

    Providers are lazy-loaded — the underlying model is only initialised
    on the first call to :meth:`embed` or :meth:`embed_batch`.

    Attributes:
        dimension: The fixed output vector dimensionality.
        model_name: Human-readable identifier (e.g. ``"all-MiniLM-L6-v2"``).
    """

    @property
    def dimension(self) -> int:
        """Return the embedding vector dimensionality."""
        ...

    @property
    def model_name(self) -> str:
        """Return the model identifier string."""
        ...

    def embed(self, text: str) -> list[float]:
        """Embed a single text string.

        Args:
            text: The input text to embed.

        Returns:
            A list of floats with length equal to :attr:`dimension`.
        """
        ...

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in a single call.

        Args:
            texts: List of input texts to embed.

        Returns:
            A list of float-lists, each with length :attr:`dimension`.
        """
        ...

    def cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors.

        Args:
            a: First embedding vector.
            b: Second embedding vector.

        Returns:
            Cosine similarity in range [-1.0, 1.0].  Returns 0.0 if
            either vector has zero magnitude.

        Example:
            >>> sim = provider.cosine_similarity(vec_a, vec_b)
            >>> print(f"Similarity: {sim:.3f}")
        """
        ...


class MiniLMProvider:
    """Embedding provider using all-MiniLM-L6-v2 (22M params, 384-dim).

    This is the fast, lightweight default.  Loads lazily on first embed call.
    Model is cached globally — creating multiple MiniLMProvider instances
    reuses the same underlying SentenceTransformer.

    Example:
        >>> p = MiniLMProvider()
        >>> vec = p.embed("hello world")
        >>> len(vec)
        384
    """

    _MODEL_ID = "all-MiniLM-L6-v2"
    _shared_model = None  # class-level cache

    def __init__(self) -> None:
        self._dim: int | None = None

    def _load(self) -> None:
        """Lazy-load the SentenceTransformer model (shared across instances)."""
        if MiniLMProvider._shared_model is None:
            from sentence_transformers import SentenceTransformer

            logger.info("[MiniLMProvider] Loading %s...", self._MODEL_ID)
            MiniLMProvider._shared_model = SentenceTransformer(self._MODEL_ID)
        if self._dim is None:
            # Probe dimension from a dummy encode
            probe = MiniLMProvider._shared_model.encode("probe")
            self._dim = len(probe)
            logger.info(
                "[MiniLMProvider] Ready — dim=%d", self._dim
            )

    @property
    def dimension(self) -> int:
        """Return 384 (the fixed output dimension for MiniLM-L6-v2)."""
        if self._dim is None:
            self._load()
        return self._dim  # type: ignore[return-value]

    @property
    def model_name(self) -> str:
        """Return ``'all-MiniLM-L6-v2'``."""
        return self._MODEL_ID

    def embed(self, text: str) -> list[float]:
        """Embed a single text using MiniLM-L6-v2.

        Args:
            text: Input text to embed.

        Returns:
            384-dimensional float list.
        """
        if MiniLMProvider._shared_model is None:
            self._load()
        return MiniLMProvider._shared_model.encode(text).tolist()  # type: ignore[union-attr]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in one call (batched by SentenceTransformer).

        Args:
            texts: List of input texts.

        Returns:
            List of 384-dimensional float lists.
        """
        if MiniLMProvider._shared_model is None:
            self._load()
        return MiniLMProvider._shared_model.encode(texts).tolist()  # type: ignore[union-attr]

    def cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two MiniLM vectors.

        Args:
            a: First embedding vector.
            b: Second embedding vector.

        Returns:
            Cosine similarity in [-1.0, 1.0].
        """
        return _cosine_sim(a, b)


class GemmaEmbeddingProvider:
    """Embedding provider using google/embeddinggemma-300m (300M params).

    Higher-quality embeddings with task-specific prompts.  The model
    supports prompt prefixes for different tasks (retrieval, clustering,
    classification, etc.) which are handled automatically by the
    SentenceTransformer pipeline.

    Falls back to MiniLM if the model fails to load (e.g. missing
    dependencies, insufficient memory).

    Example:
        >>> p = GemmaEmbeddingProvider()
        >>> vec = p.embed("hello world")
        >>> len(vec) == p.dimension
        True
    """

    _MODEL_ID = "google/embeddinggemma-300m"
    _shared_model = None  # class-level cache

    def __init__(self, *, prompt_name: str = "Retrieval") -> None:
        """Initialise the Gemma embedding provider.

        Args:
            prompt_name: SentenceTransformer prompt name for task-specific
                prefixing.  Common values: ``"Retrieval"``, ``"Clustering"``,
                ``"Classification"``.  Default is ``"Retrieval"`` which adds
                the ``"task: search result | query: "`` prefix.
        """
        self._dim: int | None = None
        self._prompt_name = prompt_name
        self._fallback: MiniLMProvider | None = None

    def _load(self) -> None:
        """Lazy-load the embeddinggemma model, falling back to MiniLM on error."""
        if GemmaEmbeddingProvider._shared_model is None:
            try:
                from sentence_transformers import SentenceTransformer

                logger.info("[GemmaProvider] Loading %s...", self._MODEL_ID)
                GemmaEmbeddingProvider._shared_model = SentenceTransformer(
                    self._MODEL_ID, trust_remote_code=True
                )
            except Exception as exc:
                logger.warning(
                    "[GemmaProvider] Failed to load %s (%s: %s) — "
                    "falling back to MiniLM",
                    self._MODEL_ID,
                    type(exc).__name__,
                    exc,
                )
                self._fallback = MiniLMProvider()
                self._dim = self._fallback.dimension
                return

        # Probe dimension from a dummy encode
        if self._dim is None:
            probe = GemmaEmbeddingProvider._shared_model.encode("probe")
            self._dim = len(probe)
            logger.info("[GemmaProvider] Ready — dim=%d", self._dim)

    @property
    def dimension(self) -> int:
        """Return the auto-detected output dimension."""
        if self._dim is None:
            self._load()
        return self._dim  # type: ignore[return-value]

    @property
    def model_name(self) -> str:
        """Return ``'google/embeddinggemma-300m'`` (or fallback model name)."""
        if self._fallback:
            return self._fallback.model_name
        return self._MODEL_ID

    def embed(self, text: str) -> list[float]:
        """Embed a single text using embeddinggemma-300m.

        Args:
            text: Input text to embed.

        Returns:
            Float list with length equal to :attr:`dimension`.
        """
        if self._fallback:
            return self._fallback.embed(text)
        if GemmaEmbeddingProvider._shared_model is None:
            self._load()
        if self._fallback:
            return self._fallback.embed(text)
        return GemmaEmbeddingProvider._shared_model.encode(  # type: ignore[union-attr]
            text, prompt_name=self._prompt_name
        ).tolist()

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in one call.

        Args:
            texts: List of input texts.

        Returns:
            List of float lists, each with length :attr:`dimension`.
        """
        if self._fallback:
            return self._fallback.embed_batch(texts)
        if GemmaEmbeddingProvider._shared_model is None:
            self._load()
        if self._fallback:
            return self._fallback.embed_batch(texts)
        return GemmaEmbeddingProvider._shared_model.encode(  # type: ignore[union-attr]
            texts, prompt_name=self._prompt_name
        ).tolist()

    def cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two embeddinggemma vectors.

        Args:
            a: First embedding vector.
            b: Second embedding vector.

        Returns:
            Cosine similarity in [-1.0, 1.0].
        """
        return _cosine_sim(a, b)


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------


def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two float vectors.

    Uses numpy for efficient computation.

    Args:
        a: First vector.
        b: Second vector.

    Returns:
        Cosine similarity in [-1.0, 1.0].  Returns 0.0 if either
        vector has zero magnitude.

    Example:
        >>> _cosine_sim([1.0, 0.0], [0.0, 1.0])
        0.0
        >>> _cosine_sim([1.0, 0.0], [1.0, 0.0])
        1.0
    """
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    dot = float(np.dot(va, vb))
    norm_a = float(np.linalg.norm(va))
    norm_b = float(np.linalg.norm(vb))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _read_config_embedding_model() -> str:
    """Read the configured embedding model name from app.json.

    Falls back to ``"minilm"`` if the config key is missing or the
    file cannot be read.

    Returns:
        One of ``"minilm"`` or ``"embeddinggemma"``.
    """
    try:
        with open(_CONFIG_PATH) as f:
            cfg = json.load(f)
        return cfg.get("embedding", {}).get("model", "minilm")
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return "minilm"


def get_provider(name: str | None = None) -> EmbeddingProvider:
    """Factory function returning the requested embedding provider.

    When ``name`` is ``None``, reads from ``backend/config/app.json``
    key ``embedding.model``.  Falls back to ``"minilm"`` if the config
    key is missing.

    Args:
        name: Provider name — ``"minilm"`` or ``"embeddinggemma"``.
            If None, reads from application config.

    Returns:
        An initialised (but lazily-loaded) EmbeddingProvider.

    Raises:
        ValueError: If ``name`` is not a recognised provider.

    Example:
        >>> provider = get_provider("minilm")
        >>> vec = provider.embed("test")
        >>> len(vec) == provider.dimension
        True
    """
    if name is None:
        name = _read_config_embedding_model()

    name_lower = name.lower().strip()

    if name_lower in ("minilm", "all-minilm-l6-v2", "minilm-l6-v2"):
        return MiniLMProvider()
    elif name_lower in ("embeddinggemma", "gemma", "google/embeddinggemma-300m"):
        return GemmaEmbeddingProvider()
    else:
        raise ValueError(
            f"Unknown embedding provider: {name!r}. "
            f"Expected 'minilm' or 'embeddinggemma'."
        )
