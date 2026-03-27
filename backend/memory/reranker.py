"""Cross-encoder reranker for memory retrieval quality improvement.

Sits between sqlite-vec nearest-neighbour retrieval and the final result
return in :class:`~backend.memory.tiered_memory.TieredMemoryManager`.
Cross-encoders evaluate query+document jointly, capturing fine-grained
semantic relevance that single-vector cosine similarity misses — at the
cost of being non-indexable (O(n) per query on the candidate set).

Typical workflow::

    reranker = MemoryReranker()
    raw_hits = memory_manager.search(query, char_id=1, top_k=20)
    refined   = reranker.rerank(query, raw_hits, top_k=5)
    for r in refined:
        print(r.rerank_score, r.text)

Graceful degradation:
    If ``sentence-transformers`` is not installed the module still imports
    and :py:meth:`MemoryReranker.rerank` / :py:meth:`MemoryReranker.rerank_simple`
    fall back to returning candidates in their original sqlite-vec order.
    A one-time warning is emitted at import time.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependency guard
# ---------------------------------------------------------------------------

try:
    from sentence_transformers import CrossEncoder  # type: ignore[import-untyped]

    _HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    _HAS_SENTENCE_TRANSFORMERS = False
    warnings.warn(
        "sentence-transformers is not installed. "
        "MemoryReranker will pass through candidates in original order. "
        "Install with: pip install sentence-transformers",
        ImportWarning,
        stacklevel=2,
    )


# ---------------------------------------------------------------------------
# Public data structures
# ---------------------------------------------------------------------------


@dataclass
class RerankResult:
    """A reranked memory item with cross-encoder relevance score.

    Attributes:
        text: The memory text content.
        original_score: Distance value from sqlite-vec (lower = closer).
        rerank_score: Cross-encoder relevance probability in [0.0, 1.0].
            Higher values indicate greater relevance to the query.
        metadata: Full original candidate dict preserved for downstream use.
    """

    text: str
    original_score: float
    rerank_score: float
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Internal fallback helper
# ---------------------------------------------------------------------------


def _passthrough_fallback(
    candidates: list[dict[str, Any]],
    top_k: int,
    text_key: str,
) -> list[RerankResult]:
    """Return candidates in original order when the model is unavailable.

    Converts sqlite-vec distance scores to an approximate relevance value
    via ``1.0 - distance`` so downstream callers always receive a
    ``rerank_score`` in roughly the same range.

    Args:
        candidates: Raw candidate dicts from sqlite-vec retrieval.
        top_k: Maximum number of results to return.
        text_key: Key in each candidate dict that holds the text content.

    Returns:
        Up to ``top_k`` :class:`RerankResult` objects in original order.
    """
    return [
        RerankResult(
            text=c[text_key],
            original_score=c.get("distance", 0.0),
            rerank_score=1.0 - c.get("distance", 0.0),
            metadata=c,
        )
        for c in candidates[:top_k]
    ]


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


class MemoryReranker:
    """Cross-encoder reranker for memory retrieval quality improvement.

    Rescores sqlite-vec nearest-neighbour results using a cross-encoder
    that sees query+memory together, capturing fine-grained semantic
    relevance that single-vector similarity misses.

    The default model is ``cross-encoder/ms-marco-MiniLM-L-6-v2``
    (~22 M parameters, ~100 MB download, Apache 2.0 licence).  At batch
    sizes of 10 it runs in roughly 10–50 ms on CPU, making it practical
    for per-message retrieval refinement.

    Thread safety:
        :py:meth:`CrossEncoder.predict` is stateless after construction;
        multiple threads may call :py:meth:`rerank` concurrently on the
        same instance without locking.

    Args:
        model_id: HuggingFace model identifier for the cross-encoder.
        device: Torch device string (e.g. ``"cpu"``, ``"cuda"``).

    Example:
        >>> reranker = MemoryReranker()
        >>> hits = [{"text": "I love ramen", "distance": 0.3},
        ...         {"text": "My cat is named Mochi", "distance": 0.4}]
        >>> results = reranker.rerank("favourite food?", hits, top_k=1)
        >>> results[0].text
        'I love ramen'
    """

    def __init__(
        self,
        model_id: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        device: str = "cpu",
    ) -> None:
        """Initialise and load the cross-encoder model.

        The model is downloaded from HuggingFace Hub on first use and
        cached in the default transformers cache directory
        (``~/.cache/huggingface/``).

        Args:
            model_id: HuggingFace model ID for the cross-encoder.
                Defaults to ``"cross-encoder/ms-marco-MiniLM-L-6-v2"``.
            device: Torch device to run inference on. Default ``"cpu"``.

        Raises:
            RuntimeError: If ``sentence-transformers`` is installed but
                the model fails to load (e.g. no network, bad model_id).
        """
        self._model_id = model_id
        self._device = device
        self._model: Any = None  # lazy-loaded on first rerank call

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        """Lazily load the CrossEncoder model on first use.

        Defers the ~100 MB download and ~500 ms load time until the
        reranker is actually called, so importing the module has zero
        cost.

        Raises:
            RuntimeError: If the model cannot be loaded.
        """
        if self._model is not None:
            return
        if not _HAS_SENTENCE_TRANSFORMERS:
            return  # graceful degradation — callers check _model is None

        try:
            logger.info(
                "Loading cross-encoder reranker model '%s' on device '%s'",
                self._model_id,
                self._device,
            )
            self._model = CrossEncoder(self._model_id, device=self._device)
            logger.info("Cross-encoder reranker ready.")
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                f"Failed to load cross-encoder model '{self._model_id}': {exc}"
            ) from exc

    @staticmethod
    def _sigmoid(x: float) -> float:
        """Apply the sigmoid function to convert raw logit to probability.

        Args:
            x: Raw logit value from the cross-encoder output.

        Returns:
            Value in the range (0.0, 1.0).
        """
        import math

        return 1.0 / (1.0 + math.exp(-x))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def rerank(
        self,
        query: str,
        candidates: list[dict[str, Any]],
        top_k: int = 3,
        text_key: str = "text",
    ) -> list[RerankResult]:
        """Rerank candidate memories by relevance to the query.

        All candidates are scored in a single batched ``predict()`` call
        for efficiency, then sorted descending by cross-encoder score
        before the top-k slice is returned.

        If ``sentence-transformers`` is unavailable, falls through to
        :func:`_passthrough_fallback` and emits a debug log.

        Args:
            query: The user message or search query string.
            candidates: List of memory dicts from sqlite-vec search.
                Each dict must contain a key matching ``text_key``.
            top_k: Number of top results to return after reranking.
                Clamped to ``len(candidates)`` if larger.
            text_key: Key in candidate dicts that holds the text content.
                Defaults to ``"text"`` (matches TieredMemoryManager output).

        Returns:
            Up to ``top_k`` :class:`RerankResult` objects sorted by
            ``rerank_score`` descending (most relevant first).

        Example:
            >>> reranker = MemoryReranker()
            >>> hits = [
            ...     {"text": "I love ramen", "distance": 0.3, "role": "user"},
            ...     {"text": "My cat is Mochi", "distance": 0.35, "role": "user"},
            ...     {"text": "I hate spiders", "distance": 0.4, "role": "user"},
            ... ]
            >>> results = reranker.rerank("favourite food?", hits, top_k=2)
            >>> results[0].text
            'I love ramen'
        """
        if not candidates:
            return []

        effective_top_k = min(top_k, len(candidates))

        # Graceful degradation when sentence-transformers not available
        if not _HAS_SENTENCE_TRANSFORMERS:
            logger.debug(
                "sentence-transformers unavailable — returning candidates in original order"
            )
            return _passthrough_fallback(candidates, effective_top_k, text_key)

        self._load_model()

        if self._model is None:
            # Model failed to load despite the library being present
            logger.warning(
                "Cross-encoder model not loaded — returning candidates in original order"
            )
            return _passthrough_fallback(candidates, effective_top_k, text_key)

        # Build query-document pairs for the cross-encoder
        pairs: list[tuple[str, str]] = [
            (query, c[text_key]) for c in candidates
        ]

        # Single batched prediction — raw logits
        raw_scores: list[float] = self._model.predict(pairs).tolist()

        # Convert logits → probabilities and zip with candidates
        scored: list[tuple[float, dict[str, Any]]] = [
            (self._sigmoid(score), candidate)
            for score, candidate in zip(raw_scores, candidates)
        ]

        # Sort descending by cross-encoder relevance
        scored.sort(key=lambda t: t[0], reverse=True)

        return [
            RerankResult(
                text=candidate[text_key],
                original_score=candidate.get("distance", 0.0),
                rerank_score=rerank_score,
                metadata=candidate,
            )
            for rerank_score, candidate in scored[:effective_top_k]
        ]

    def rerank_simple(
        self,
        query: str,
        texts: list[str],
        top_k: int = 3,
    ) -> list[tuple[int, float]]:
        """Rerank a plain list of texts, returning indices and scores.

        Convenience wrapper for callers that only have a list of strings
        rather than full memory dicts.  Internally wraps each string into
        a minimal dict and delegates to :py:meth:`rerank`.

        Args:
            query: The search query string.
            texts: List of candidate text strings to rerank.
            top_k: Number of top results to return.
                Clamped to ``len(texts)`` if larger.

        Returns:
            List of ``(original_index, score)`` tuples sorted by score
            descending.  ``original_index`` is the position of the text
            in the input ``texts`` list.

        Example:
            >>> reranker = MemoryReranker()
            >>> texts = ["I love ramen", "My cat is Mochi", "I hate spiders"]
            >>> reranker.rerank_simple("favourite food?", texts, top_k=1)
            [(0, 0.9...)]
        """
        if not texts:
            return []

        # Wrap strings as minimal candidate dicts, preserving original index
        candidates: list[dict[str, Any]] = [
            {"text": t, "_original_index": i, "distance": 0.0}
            for i, t in enumerate(texts)
        ]

        results = self.rerank(query, candidates, top_k=top_k, text_key="text")

        return [
            (r.metadata["_original_index"], r.rerank_score)
            for r in results
        ]
