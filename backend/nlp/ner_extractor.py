"""Zero-shot Named Entity Recognition using GLiNER.

Extracts named entities from user messages (people, places, media, pets,
hobbies, etc.) using GLiNER's zero-shot capability.  This supplements the
existing :mod:`backend.knowledge.extractor` module, which uses expensive LLM
calls, with a fast, local, offline alternative (~200 ms on M2 Pro CPU).

The ``urchade/gliner_small-v2.1`` model (~166 M params, Apache 2.0) is loaded
lazily on first call so that importing this module is cheap.  If the ``gliner``
package is not installed, every call returns an empty list — the rest of the
application continues to work without modification.

Typical usage::

    extractor = NERExtractor()
    entities = extractor.extract("I love watching Spirited Away with my cat Luna")
    # [NEREntity(text='Spirited Away', entity_type='media_title', confidence=0.92, ...),
    #  NEREntity(text='Luna', entity_type='pet_name', confidence=0.78, ...)]

    # To feed the knowledge graph directly:
    facts = extractor.extract_for_knowledge_graph("I live in Tokyo and enjoy hiking")
    # [{'category': 'places', 'fact_text': 'User lives in Tokyo', 'confidence': 0.91},
    #  {'category': 'interests', 'fact_text': 'User enjoys hiking', 'confidence': 0.85}]
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Availability flag — set once on first _load attempt
# ---------------------------------------------------------------------------

_HAS_GLINER: bool | None = None  # None = not yet probed

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

DEFAULT_ENTITY_TYPES: list[str] = [
    "person",
    "place",
    "media_title",
    "food",
    "pet_name",
    "hobby",
    "event",
    "organization",
    "time_reference",
]

# Maps GLiNER entity types to user_facts table ``category`` column values.
# Categories must match those recognised by FactExtractor / the ``user_facts``
# table: identity | preferences | history | relationship | general.
# We extend to the NLP-friendly names used by NERExtractor and map them here.
ENTITY_TO_CATEGORY: dict[str, str] = {
    "person": "relationship",
    "place": "identity",
    "media_title": "preferences",
    "food": "preferences",
    "pet_name": "identity",
    "hobby": "preferences",
    "event": "history",
    "organization": "general",
    "time_reference": "general",
}

# Minimum GLiNER confidence score for an entity to be returned.
CONFIDENCE_THRESHOLD: float = 0.5


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------


@dataclass
class NEREntity:
    """A single named entity extracted from text by :class:`NERExtractor`.

    Attributes:
        text: The entity surface form as it appears in the original text,
            e.g. ``"Spirited Away"``.
        entity_type: The GLiNER label, e.g. ``"media_title"``.
        confidence: Model confidence score in the range ``[0.0, 1.0]``.
        start: Character offset (inclusive) of the entity in the source text.
        end: Character offset (exclusive) of the entity in the source text.

    Example:
        >>> e = NEREntity(text="Tokyo", entity_type="place",
        ...               confidence=0.91, start=10, end=15)
        >>> e.text
        'Tokyo'
    """

    text: str
    entity_type: str
    confidence: float
    start: int
    end: int


# ---------------------------------------------------------------------------
# Extractor
# ---------------------------------------------------------------------------


class NERExtractor:
    """Zero-shot named entity extractor using GLiNER.

    Lazy-loads the model on first call to :meth:`extract` so that importing
    this module is cheap.  Falls back gracefully to empty results if the
    ``gliner`` package is not installed or the model cannot be loaded.

    The underlying GLiNER model is stateless during inference, so a single
    instance is safe to reuse across threads without additional locking.

    Attributes:
        model_id: HuggingFace model identifier used for loading.
        device: Torch device string (``"cpu"`` or ``"cuda"``).

    Example:
        >>> extractor = NERExtractor()
        >>> entities = extractor.extract("My cat Mochi loves tuna")
        >>> entities[0].entity_type in ("pet_name", "food")
        True
    """

    def __init__(
        self,
        model_id: str = "urchade/gliner_small-v2.1",
        device: str = "cpu",
    ) -> None:
        """Initialise the extractor without loading the model.

        The GLiNER model is NOT loaded here; it is deferred to the first call
        of :meth:`extract`.

        Args:
            model_id: HuggingFace model identifier.  Defaults to
                ``"urchade/gliner_small-v2.1"`` (~166 M params, Apache 2.0).
            device: Torch device for inference.  ``"cpu"`` works on all
                machines; pass ``"cuda"`` to use a GPU if available.
        """
        self.model_id = model_id
        self.device = device
        self._model: object | None = None
        self._available: bool | None = None  # None = not yet probed

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        """Attempt to load the GLiNER model from HuggingFace Hub.

        Sets ``self._available`` to ``True`` on success or ``False`` when
        either ``gliner`` is missing or the model cannot be loaded.  The
        result is cached so the probe runs only once per instance.

        If ``gliner`` is installed but the model has not been downloaded yet,
        this call will trigger a one-time download (~330 MB).
        """
        if self._available is not None:
            # Already probed — nothing to do.
            return

        try:
            from gliner import GLiNER  # type: ignore[import-untyped]

            self._model = GLiNER.from_pretrained(self.model_id)
            self._available = True
            logger.debug("GLiNER model loaded: %s on %s", self.model_id, self.device)
        except Exception as exc:  # noqa: BLE001 — broad catch is intentional
            # gliner not installed, model download failed, OOM, etc.
            logger.debug("GLiNER not available (non-fatal): %s", exc)
            self._model = None
            self._available = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(
        self,
        text: str,
        entity_types: list[str] | None = None,
    ) -> list[NEREntity]:
        """Extract named entities from text.

        If ``gliner`` is not installed or the model failed to load, returns
        ``[]`` so callers never need to handle an exception from this method.

        Args:
            text: User message to analyse.  Strings longer than 512 characters
                are silently truncated to avoid tokeniser overflow.
            entity_types: Override the default entity type labels.  If
                ``None``, uses :data:`DEFAULT_ENTITY_TYPES`.

        Returns:
            List of :class:`NEREntity` instances sorted by confidence
            descending.  Entities below :data:`CONFIDENCE_THRESHOLD` are
            filtered out.

        Example:
            >>> extractor = NERExtractor()
            >>> results = extractor.extract("I watched Spirited Away last night")
            >>> results[0].text
            'Spirited Away'
            >>> results[0].entity_type
            'media_title'
        """
        self._load_model()

        if not self._available or self._model is None:
            return []

        if not text or not text.strip():
            return []

        labels = entity_types if entity_types is not None else DEFAULT_ENTITY_TYPES

        # GLiNER has a soft limit around 512 tokens; truncate defensively.
        safe_text = text[:512] if len(text) > 512 else text

        try:
            raw_entities: list[dict] = self._model.predict_entities(  # type: ignore[union-attr]
                safe_text,
                labels,
                threshold=CONFIDENCE_THRESHOLD,
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("GLiNER inference failed (non-fatal): %s", exc)
            return []

        entities: list[NEREntity] = []
        for item in raw_entities:
            try:
                entity = NEREntity(
                    text=str(item["text"]),
                    entity_type=str(item["label"]),
                    confidence=float(item["score"]),
                    start=int(item["start"]),
                    end=int(item["end"]),
                )
                if entity.confidence >= CONFIDENCE_THRESHOLD:
                    entities.append(entity)
            except (KeyError, TypeError, ValueError) as exc:
                logger.debug("Skipping malformed GLiNER entity: %s", exc)

        entities.sort(key=lambda e: e.confidence, reverse=True)
        return entities

    def extract_for_knowledge_graph(self, text: str) -> list[dict]:
        """Extract entities in the format expected by FactExtractor.

        Maps GLiNER entity types to ``user_facts`` table categories via
        :data:`ENTITY_TO_CATEGORY` and formats each entity as a human-readable
        fact string suitable for the ``fact_text`` column.

        This method is designed to be called as a cheap pre-processing step
        before (or instead of) the LLM-based :func:`~backend.knowledge.extractor.extract_facts`
        call, allowing the knowledge graph to be populated without an LLM
        round-trip.

        Args:
            text: User message to analyse.

        Returns:
            List of dicts with keys ``category``, ``fact_text``, and
            ``confidence``.  Entities that have no mapping in
            :data:`ENTITY_TO_CATEGORY` fall back to the ``"general"``
            category.  Returns ``[]`` when GLiNER is unavailable or no
            entities are found above :data:`CONFIDENCE_THRESHOLD`.

        Example:
            >>> extractor = NERExtractor()
            >>> facts = extractor.extract_for_knowledge_graph(
            ...     "I went to Kyoto last summer")
            >>> facts[0]["category"]
            'identity'
            >>> facts[0]["fact_text"]
            'User mentioned place: Kyoto'
        """
        entities = self.extract(text)
        if not entities:
            return []

        results: list[dict] = []
        for entity in entities:
            category = ENTITY_TO_CATEGORY.get(entity.entity_type, "general")
            fact_text = _format_fact(entity)
            results.append(
                {
                    "category": category,
                    "fact_text": fact_text,
                    "confidence": entity.confidence,
                }
            )
        return results


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _format_fact(entity: NEREntity) -> str:
    """Format a :class:`NEREntity` as a human-readable fact string.

    Produces a consistent ``"User <verb> <type>: <text>"`` sentence fragment
    that fits naturally into the ``user_facts.fact_text`` column alongside
    facts generated by the LLM extractor.

    Args:
        entity: The entity to format.

    Returns:
        A short descriptive string, e.g. ``"User mentioned pet: Mochi"``.

    Example:
        >>> e = NEREntity("Mochi", "pet_name", 0.88, 8, 13)
        >>> _format_fact(e)
        'User mentioned pet: Mochi'
    """
    # Human-friendly verb/label pairs for each entity type
    _LABELS: dict[str, str] = {
        "person": "knows person",
        "place": "mentioned place",
        "media_title": "likes media",
        "food": "mentioned food",
        "pet_name": "mentioned pet",
        "hobby": "enjoys hobby",
        "event": "mentioned event",
        "organization": "mentioned organization",
        "time_reference": "mentioned time",
    }
    label = _LABELS.get(entity.entity_type, f"mentioned {entity.entity_type.replace('_', ' ')}")
    return f"User {label}: {entity.text}"
