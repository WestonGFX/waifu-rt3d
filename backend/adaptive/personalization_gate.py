"""Over-personalization gate for memory/fact injection into LLM context.

Implements the Self-ReCheck pattern: before injecting a memory or user fact
into the LLM context window, every candidate must pass three sequential gates.
All checks are local, synchronous, and sub-millisecond — no LLM call is made.

Gates (applied in order):
    1. **Relevance** — memory keywords must overlap with the current topic.
    2. **Repetition** — the same memory must not have been injected in the
       last 5 turns.
    3. **Appropriateness** — sensitive-category memories are blocked unless
       the *user* brought that category up first in the current conversation.

Typical usage::

    from backend.adaptive.personalization_gate import filter_memories_for_context

    safe_memories = filter_memories_for_context(
        candidate_memories=raw_memories,
        current_messages=chat_history[-10:],
        max_memories=5,
    )

All processing is local — no user data leaves the machine.
"""

from __future__ import annotations

import hashlib
import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Sensitive topic categories that require the user to raise them first.
SENSITIVE_CATEGORIES: frozenset[str] = frozenset(
    {
        "health",
        "medical",
        "mental_health",
        "finances",
        "money",
        "relationship_problems",
        "grief",
        "trauma",
        "family_conflict",
    }
)

#: Trigger keywords per sensitive category.
SENSITIVITY_KEYWORDS: dict[str, frozenset[str]] = {
    "health": frozenset(
        {
            "sick",
            "doctor",
            "hospital",
            "surgery",
            "diagnosis",
            "medication",
            "illness",
            "disease",
        }
    ),
    "medical": frozenset(
        {
            "prescription",
            "symptoms",
            "treatment",
            "therapy",
            "clinic",
        }
    ),
    "mental_health": frozenset(
        {
            "depression",
            "anxiety",
            "panic",
            "ocd",
            "ptsd",
            "bipolar",
            "therapist",
            "counselor",
        }
    ),
    "finances": frozenset(
        {
            "debt",
            "bankrupt",
            "loan",
            "mortgage",
            "bills",
            "salary",
            "fired",
            "unemployed",
        }
    ),
    "money": frozenset(
        {
            "broke",
            "expensive",
            "afford",
            "rent",
            "payment",
        }
    ),
    "relationship_problems": frozenset(
        {
            "breakup",
            "divorce",
            "cheating",
            "affair",
            "ex-",
            "separated",
        }
    ),
    "grief": frozenset(
        {
            "died",
            "death",
            "funeral",
            "mourning",
            "loss",
            "passed away",
            "grieving",
        }
    ),
    "trauma": frozenset(
        {
            "abuse",
            "assault",
            "violence",
            "nightmare",
            "flashback",
            "ptsd",
        }
    ),
    "family_conflict": frozenset(
        {
            "disowned",
            "estranged",
            "custody",
            "argument",
            "fighting",
        }
    ),
}

#: Common English stopwords excluded from keyword overlap checks.
STOPWORDS: frozenset[str] = frozenset(
    {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "can",
        "shall",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "about",
        "like",
        "through",
        "after",
        "over",
        "between",
        "out",
        "up",
        "down",
        "off",
        "i",
        "me",
        "my",
        "you",
        "your",
        "he",
        "she",
        "it",
        "we",
        "they",
        "them",
        "this",
        "that",
        "and",
        "but",
        "or",
        "not",
        "so",
        "if",
        "then",
        "just",
        "very",
        "really",
        "too",
        "also",
        "more",
        "some",
        "any",
    }
)

#: How many turns back to check for repeated injection.
_REPETITION_WINDOW: int = 5

#: Pre-compiled word tokeniser — lowercase ASCII words only.
_WORD_RE: re.Pattern[str] = re.compile(r"[a-z]+")

# ---------------------------------------------------------------------------
# Domain synonym groups for Gate 1 relevance broadening
# ---------------------------------------------------------------------------
# Each tuple is a group of synonymous / closely-related words.  If a memory
# keyword and a topic keyword share the same group the memory is considered
# on-topic even without an exact lexical match.  Keep this list short and
# companion-app focused — it is not a thesaurus.
_DOMAIN_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"cat", "cats", "kitten", "kittens", "feline", "pet", "pets", "animal", "animals"}),
    frozenset({"dog", "dogs", "puppy", "puppies", "canine", "retriever", "hound", "poodle", "labrador", "pet", "pets", "animal", "animals"}),
    frozenset({"food", "eat", "eating", "meal", "meals", "lunch", "dinner", "breakfast", "snack", "cook", "cooking", "recipe"}),
    frozenset({"game", "games", "gaming", "play", "playing", "stream", "streaming", "esports"}),
    frozenset({"music", "song", "songs", "listen", "listening", "album", "band", "artist", "concert"}),
    frozenset({"work", "job", "career", "office", "boss", "colleague", "meeting", "project"}),
    frozenset({"school", "study", "studying", "class", "college", "university", "homework", "exam", "test"}),
    frozenset({"family", "mom", "dad", "parent", "parents", "sibling", "brother", "sister", "relative"}),
    frozenset({"friend", "friends", "friendship", "buddy", "buddies", "pal", "pals", "bestie"}),
    frozenset({"travel", "trip", "vacation", "holiday", "journey", "visit", "visiting", "abroad"}),
    frozenset({"health", "sick", "doctor", "hospital", "medicine", "medication", "illness", "wellness", "fitness", "exercise"}),
    frozenset({"money", "finance", "finances", "budget", "salary", "income", "expense", "expenses", "debt", "loan"}),
    frozenset({"book", "books", "read", "reading", "novel", "manga", "comic", "author"}),
    frozenset({"movie", "movies", "film", "films", "watch", "watching", "anime", "series", "show", "shows"}),
    frozenset({"hobby", "hobbies", "interest", "interests", "passion", "pastime"}),
    frozenset({"hike", "hiking", "trail", "trails", "trek", "trekking", "walk", "walking", "outdoors", "nature", "park"}),
)

# Build a word → set-of-group-indices map.  A word can belong to multiple
# groups (e.g. "pets" is relevant to both the cats and dogs groups).
_DOMAIN_MAP: dict[str, set[int]] = {}
for _gi, _group in enumerate(_DOMAIN_GROUPS):
    for _word in _group:
        if _word not in _DOMAIN_MAP:
            _DOMAIN_MAP[_word] = set()
        _DOMAIN_MAP[_word].add(_gi)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def should_inject_memory(
    memory_text: str,
    current_topic: str,
    recently_mentioned: set[str],
    turn_count: int,
) -> bool:
    """Apply the three-gate check before injecting a memory into LLM context.

    Gates are evaluated in order; the first failure short-circuits the rest.

    Gate 1 — Relevance:
        At least one non-stopword from *memory_text* must appear in
        *current_topic* (case-insensitive).

    Gate 2 — Repetition:
        The MD5 hash of *memory_text* (first 100 chars, lowercased) must not
        be present in *recently_mentioned*.

    Gate 3 — Appropriateness:
        If *memory_text* belongs to a sensitive category the injection is
        blocked unless the caller has already confirmed user initiation
        (pass the appropriateness check externally via
        :func:`_user_initiated_topic` and omit sensitive memories that fail
        it before building *recently_mentioned*).

        .. note::
            When ``turn_count <= 2`` (very early in the session) the
            appropriateness gate is extra-strict: *any* sensitive memory is
            blocked regardless of user initiation, to avoid an awkward
            opening move by the AI.

    Args:
        memory_text: The memory or user-fact string to evaluate.
        current_topic: Free-text string representing the current conversation
            topic — typically the concatenation of the last 1–3 messages.
        recently_mentioned: Set of ``_compute_memory_hash`` values for
            memories already injected in the preceding
            ``_REPETITION_WINDOW`` turns.  Mutated externally; this function
            does **not** add to the set.
        turn_count: Number of turns elapsed so far in the current session.
            Used by the appropriateness gate for early-session caution.

    Returns:
        ``True`` when the memory passes all three gates and should be
        included in the LLM context; ``False`` otherwise.

    Example:
        >>> should_inject_memory("User likes cats", "Tell me about your pets", set(), 3)
        True
        >>> should_inject_memory("User had a breakup", "What is for lunch?", set(), 1)
        False
        >>> already = {_compute_memory_hash("User likes cats")}
        >>> should_inject_memory("User likes cats", "Tell me about your pets", already, 3)
        False
    """
    # ---- Gate 1: Relevance ------------------------------------------------
    memory_keywords = _extract_keywords_from_text(memory_text)
    topic_keywords = _extract_keywords_from_text(current_topic)

    if not _keywords_related(memory_keywords, topic_keywords):
        logger.debug(
            "personalization_gate: Gate 1 FAIL (no keyword overlap) — memory=%r",
            memory_text[:60],
        )
        return False

    # ---- Gate 2: Repetition -----------------------------------------------
    mem_hash = _compute_memory_hash(memory_text)
    if mem_hash in recently_mentioned:
        logger.debug(
            "personalization_gate: Gate 2 FAIL (repeated injection) — hash=%s",
            mem_hash,
        )
        return False

    # ---- Gate 3: Appropriateness ------------------------------------------
    category = detect_sensitivity(memory_text)
    if category is not None:
        # Extra caution in first two turns — no sensitive topics at all.
        if turn_count <= 2:
            logger.debug(
                "personalization_gate: Gate 3 FAIL (early-session sensitive) "
                "— category=%s turn=%d",
                category,
                turn_count,
            )
            return False

        # Outside early turns the caller is expected to have filtered
        # memories where the user did not initiate the topic.  A sensitive
        # memory that reaches this point without the user raising the topic
        # is blocked here as a second line of defence.
        topic_text_lower = current_topic.lower()
        category_kws = SENSITIVITY_KEYWORDS.get(category, frozenset())
        user_raised = any(kw in topic_text_lower for kw in category_kws)
        if not user_raised:
            logger.debug(
                "personalization_gate: Gate 3 FAIL (user did not initiate) "
                "— category=%s",
                category,
            )
            return False

    logger.debug(
        "personalization_gate: all gates PASS — memory=%r",
        memory_text[:60],
    )
    return True


def filter_memories_for_context(
    candidate_memories: list[dict],
    current_messages: list[dict],
    max_memories: int = 5,
) -> list[dict]:
    """Filter and rank candidate memories through the personalization gate.

    Applies :func:`should_inject_memory` to each candidate memory, removes
    those that fail any gate, then returns the top *max_memories* survivors
    sorted by ``importance`` descending.

    The function derives the current topic and the recently-mentioned set
    from *current_messages* so callers do not have to maintain that state
    manually.

    Args:
        candidate_memories: List of memory dicts.  Each dict must contain:

            - ``"text"`` (str): The memory or fact text.
            - ``"importance"`` (float): Numeric importance score; higher
              values are ranked first.
            - ``"id"`` (str | int): Unique identifier for the memory.

            Extra keys are passed through unchanged.
        current_messages: Recent conversation history.  Each dict must
            contain ``"role"`` (``"user"`` | ``"assistant"`` | ``"system"``)
            and ``"content"`` (str).  Only the last 10 messages are
            examined.
        max_memories: Maximum number of memories to return.  Defaults to
            ``5``.

    Returns:
        Subset of *candidate_memories* that passed all gates, sorted by
        ``importance`` descending, limited to *max_memories* items.  Each
        returned dict is a reference to the original object (not a copy).

    Example:
        >>> memories = [
        ...     {"id": 1, "text": "User loves hiking", "importance": 0.9},
        ...     {"id": 2, "text": "User had surgery last year", "importance": 0.8},
        ...     {"id": 3, "text": "User owns a golden retriever", "importance": 0.7},
        ... ]
        >>> messages = [
        ...     {"role": "user", "content": "I went on a trail with my dog today!"},
        ...     {"role": "assistant", "content": "That sounds fun!"},
        ... ]
        >>> result = filter_memories_for_context(memories, messages, max_memories=5)
        >>> [m["id"] for m in result]
        [1, 3]
    """
    recent = current_messages[-10:]

    # Step 1: Build current topic string from last 3 messages.
    topic_messages = recent[-3:]
    current_topic = " ".join(
        m.get("content", "") for m in topic_messages if isinstance(m.get("content"), str)
    )

    # Step 2: Build recently_mentioned set from last 5 assistant messages.
    assistant_texts: list[str] = []
    for m in reversed(recent):
        if m.get("role") == "assistant":
            content = m.get("content", "")
            if isinstance(content, str):
                assistant_texts.append(content)
        if len(assistant_texts) >= _REPETITION_WINDOW:
            break

    recently_mentioned: set[str] = set()
    for text in assistant_texts:
        # Each assistant message may contain fragments of injected memories.
        # We hash each full assistant message as a proxy; callers that want
        # exact memory tracking should maintain recently_mentioned externally
        # and pass it to should_inject_memory directly.
        recently_mentioned.add(_compute_memory_hash(text))

    # Step 3: Extract user messages for user-initiation check.
    user_messages: list[str] = [
        m.get("content", "")
        for m in recent
        if m.get("role") == "user" and isinstance(m.get("content"), str)
    ]

    turn_count = len(recent)

    # Step 4: Gate each candidate.
    passed: list[dict] = []
    for mem in candidate_memories:
        text = mem.get("text", "")
        if not isinstance(text, str) or not text.strip():
            logger.debug(
                "filter_memories_for_context: skipping memory id=%s — empty text",
                mem.get("id"),
            )
            continue

        # For sensitive memories, check user initiation explicitly and
        # override the topic string used in Gate 3 with user messages only.
        category = detect_sensitivity(text)
        effective_topic = current_topic
        if category is not None:
            if not _user_initiated_topic(category, user_messages):
                logger.debug(
                    "filter_memories_for_context: blocking sensitive memory id=%s "
                    "— user did not initiate category=%s",
                    mem.get("id"),
                    category,
                )
                continue
            # Build a user-only topic to satisfy Gate 3's keyword check.
            effective_topic = " ".join(user_messages)

        if should_inject_memory(text, effective_topic, recently_mentioned, turn_count):
            passed.append(mem)

    # Step 5: Sort by importance descending.
    passed.sort(key=lambda m: float(m.get("importance", 0.0)), reverse=True)

    return passed[:max_memories]


def detect_sensitivity(text: str) -> str | None:
    """Detect whether *text* touches a sensitive topic category.

    Iterates over every category in :data:`SENSITIVITY_KEYWORDS` and checks
    whether any of its keywords appear as substrings in the lowercased *text*.
    Multi-word keywords (e.g. ``"passed away"``) are matched as plain
    substrings rather than whole-word tokens, which is intentionally
    conservative.

    Args:
        text: The memory or message text to check.

    Returns:
        The name of the first matching category (e.g. ``"health"``), or
        ``None`` when no sensitive keywords are found.

    Example:
        >>> detect_sensitivity("I went to the doctor yesterday")
        'health'
        >>> detect_sensitivity("I love pizza")
        >>> detect_sensitivity("She passed away last spring")
        'grief'
    """
    if not text:
        return None

    text_lower = text.lower()
    for category, keywords in SENSITIVITY_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return category
    return None


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _extract_topic_keywords(messages: list[dict], max_messages: int = 3) -> set[str]:
    """Extract meaningful keywords from recent messages.

    Concatenates the ``"content"`` field of the last *max_messages* messages,
    tokenises into lowercase ASCII words, and removes stopwords.

    Args:
        messages: List of message dicts with ``"role"`` and ``"content"``
            keys.  Order is preserved; the last *max_messages* entries are used.
        max_messages: How many trailing messages to examine.  Defaults to
            ``3``.

    Returns:
        Set of lowercase keyword strings with stopwords removed.

    Example:
        >>> msgs = [
        ...     {"role": "user", "content": "I love hiking with my dog"},
        ...     {"role": "assistant", "content": "That sounds amazing!"},
        ... ]
        >>> kws = _extract_topic_keywords(msgs, max_messages=2)
        >>> "hiking" in kws
        True
        >>> "with" in kws
        False
    """
    recent = messages[-max_messages:] if len(messages) > max_messages else messages
    combined = " ".join(
        m.get("content", "")
        for m in recent
        if isinstance(m.get("content"), str)
    )
    return _extract_keywords_from_text(combined)


def _user_initiated_topic(category: str, user_messages: list[str]) -> bool:
    """Check whether the user introduced a sensitive topic category.

    Scans each string in *user_messages* for the presence of any keyword
    belonging to *category* from :data:`SENSITIVITY_KEYWORDS`.  Multi-word
    keywords are matched as plain substrings.

    Args:
        category: One of the keys in :data:`SENSITIVITY_KEYWORDS` (e.g.
            ``"grief"``).
        user_messages: List of raw user message strings from the current
            conversation window.

    Returns:
        ``True`` if any user message contains at least one keyword from
        *category*; ``False`` otherwise (including when *category* is
        unknown or *user_messages* is empty).

    Example:
        >>> _user_initiated_topic("health", ["I have been feeling sick lately"])
        True
        >>> _user_initiated_topic("health", ["Let's grab lunch"])
        False
    """
    keywords = SENSITIVITY_KEYWORDS.get(category, frozenset())
    if not keywords:
        return False

    for msg in user_messages:
        msg_lower = msg.lower()
        for kw in keywords:
            if kw in msg_lower:
                return True
    return False


def _compute_memory_hash(text: str) -> str:
    """Compute a short hash of *text* for deduplication purposes.

    Normalises by lowercasing and truncating to the first 100 characters
    before hashing so that minor trailing variations of the same fact do not
    produce different buckets.

    Args:
        text: The memory or fact string to hash.

    Returns:
        A 12-character hexadecimal string derived from the MD5 digest of the
        normalised text.

    Example:
        >>> h = _compute_memory_hash("User likes cats")
        >>> len(h)
        12
        >>> h == _compute_memory_hash("User likes cats — they have two")
        False
        >>> h == _compute_memory_hash("user likes cats")
        True
    """
    normalised = text.lower()[:100]
    return hashlib.md5(normalised.encode("utf-8", errors="replace")).hexdigest()[:12]


def _extract_keywords_from_text(text: str) -> set[str]:
    """Tokenise *text* and return non-stopword lowercase words.

    Args:
        text: Arbitrary text string.

    Returns:
        Set of lowercase ASCII words with stopwords removed.  Returns an
        empty set for empty or non-alphabetic input.
    """
    words = _WORD_RE.findall(text.lower())
    return {w for w in words if w not in STOPWORDS}


def _keywords_related(kw_a: set[str], kw_b: set[str]) -> bool:
    """Return True if the two keyword sets share at least one meaningful word.

    Checks for:

    1. **Exact overlap** — a word appears in both sets.
    2. **Domain overlap** — a word from each set belongs to the same
       pre-defined domain group in :data:`_DOMAIN_GROUPS` (e.g. ``"cats"``
       and ``"pets"`` both map to the animals group).

    Args:
        kw_a: First set of non-stopword keywords (e.g. from a memory string).
        kw_b: Second set of non-stopword keywords (e.g. from a topic string).

    Returns:
        ``True`` when at least one of the two relation tests succeeds;
        ``False`` when both sets are empty or share no relation.

    Example:
        >>> _keywords_related({"cats"}, {"pets"})
        True
        >>> _keywords_related({"hiking"}, {"lunch"})
        False
        >>> _keywords_related({"hiking"}, {"hiking", "trail"})
        True
    """
    if not kw_a or not kw_b:
        return False

    # Fast path: exact lexical intersection.
    if kw_a & kw_b:
        return True

    # Domain-aware broadening: map each keyword to its group indices and check
    # for any shared group between the two sets.
    groups_a: set[int] = set()
    for w in kw_a:
        if w in _DOMAIN_MAP:
            groups_a.update(_DOMAIN_MAP[w])

    groups_b: set[int] = set()
    for w in kw_b:
        if w in _DOMAIN_MAP:
            groups_b.update(_DOMAIN_MAP[w])

    return bool(groups_a & groups_b)
