"""Embedding provider abstraction for semantic search.

This package provides a unified interface for text embedding models,
allowing the application to swap between MiniLM (fast, 384-dim) and
embeddinggemma (higher quality, auto-detected dim) without changing
consumer code.

Usage::

    from backend.embeddings.provider import get_provider

    provider = get_provider("minilm")       # fast, 384-dim
    provider = get_provider("embeddinggemma")  # better quality
    provider = get_provider()                # from app config

    vec = provider.embed("hello world")
    vecs = provider.embed_batch(["hello", "world"])
"""

from backend.embeddings.provider import (
    EmbeddingProvider,
    GemmaEmbeddingProvider,
    MiniLMProvider,
    get_provider,
)

__all__ = [
    "EmbeddingProvider",
    "GemmaEmbeddingProvider",
    "MiniLMProvider",
    "get_provider",
]
