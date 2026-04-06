"""Memory-to-Behavior Pipeline — AIE Phase B.

Transforms retrieved memories from :mod:`backend.memory.tiered_memory` into
concrete behavioral instructions for the LLM prompt.  The goal is to make the
character *act differently* based on what she remembers about the user, not
merely include raw memory text in the context.

Four behavioral channels are produced:

- **emotional_coloring**: Tone guidance based on dominant emotions detected in
  recent memories.
- **behavioral_priming**: Style guidance derived from user preference profile
  values (e.g. pref_humor, pref_depth).
- **proactive_references**: Specific facts / events the character can weave into
  the current reply naturally.
- **relationship_continuity**: Inside jokes, pet names, and shared phrases that
  reinforce the bond.

All processing is pure Python — no LLM calls, no database access.

Example:
    >>> from backend.adaptive.memory_behavior import (
    ...     derive_behavior_from_memories,
    ...     build_memory_behavior_block,
    ... )
    >>> mems = [
    ...     {
    ...         "text": "User mentioned their cat Mochi is sick",
    ...         "tier": 2,
    ...         "salience": 0.7,
    ...         "role": "user",
    ...         "created_at": "2026-04-01",
    ...     }
    ... ]
    >>> behavior = derive_behavior_from_memories(
    ...     mems, {"pref_empathy": 0.8}, "emotional_support"
    ... )
    >>> behavior["emotional_coloring"]
    'approach with gentleness'
    >>> block = build_memory_behavior_block(behavior)
    >>> "Memory-driven behavior" in block
    True
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword sets (module-level constants)
# ---------------------------------------------------------------------------

#: Maps an emotion category to a set of trigger keywords.
_EMOTIONAL_KEYWORDS: dict[str, frozenset[str]] = {
    "sadness": frozenset(
        {
            "sad",
            "crying",
            "cry",
            "upset",
            "depressed",
            "lonely",
            "miserable",
            "heartbroken",
            "grief",
            "grieving",
            "sorrowful",
            "unhappy",
            "devastated",
            "hurt",
            "miss",
            "missing",
        }
    ),
    "excitement": frozenset(
        {
            "excited",
            "exciting",
            "amazing",
            "thrilled",
            "happy",
            "happiness",
            "great",
            "wonderful",
            "fantastic",
            "awesome",
            "love",
            "loved",
            "joy",
            "joyful",
            "delighted",
            "elated",
            "pumped",
            "overjoyed",
            "incredible",
        }
    ),
    "anxiety": frozenset(
        {
            "anxious",
            "anxiety",
            "worried",
            "worry",
            "stressed",
            "stress",
            "nervous",
            "nervous",
            "scared",
            "fear",
            "afraid",
            "overwhelmed",
            "panic",
            "panicking",
            "dread",
            "tense",
            "uneasy",
        }
    ),
    "comfort": frozenset(
        {
            "comfortable",
            "safe",
            "relaxed",
            "cozy",
            "calm",
            "peaceful",
            "content",
            "settled",
            "warm",
            "secure",
            "relieved",
        }
    ),
}

#: Keywords that indicate the user enjoys humour and playful exchanges.
_HUMOR_INDICATORS: frozenset[str] = frozenset(
    {
        "lol",
        "haha",
        "hahaha",
        "lmao",
        "lmfao",
        "rofl",
        "joke",
        "jokes",
        "funny",
        "hilarious",
        "laughed",
        "laughing",
        "laugh",
        "giggle",
        "giggled",
        "cracked up",
        "😂",
        "🤣",
        "xd",
        "xD",
    }
)

#: Keywords that suggest deep / philosophical conversation.
_DEPTH_INDICATORS: frozenset[str] = frozenset(
    {
        "meaning",
        "philosophy",
        "philosophical",
        "purpose",
        "existence",
        "universe",
        "theory",
        "hypothesis",
        "wonder",
        "ponder",
        "reflect",
        "contemplate",
        "introspect",
        "soul",
        "consciousness",
        "metaphysics",
        "why",
        "question everything",
    }
)

# Pre-compiled tokeniser — splits text into lowercase word tokens.
_WORD_RE: re.Pattern[str] = re.compile(r"[a-z0-9']+")

# Patterns that suggest pet names or inside-joke-like repeated phrases.
_PET_NAME_RE: re.Pattern[str] = re.compile(
    r"\b(babe|boo|love|darling|honey|sweetheart|dear|cutie|angel|sunshine|"
    r"princess|little one|my [a-z]+)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _tokenise(text: str) -> list[str]:
    """Tokenise *text* into a list of lowercase word tokens.

    Args:
        text: Raw string to tokenise.

    Returns:
        Ordered list of word tokens (alphanumeric + apostrophes).
    """
    return _WORD_RE.findall(text.lower())


def _count_keywords(tokens: list[str], keyword_set: frozenset[str]) -> int:
    """Count how many tokens appear in *keyword_set*.

    Args:
        tokens: Pre-tokenised list of lowercase strings.
        keyword_set: Set of target keywords to match against.

    Returns:
        Integer count of token hits.
    """
    return sum(1 for t in tokens if t in keyword_set)


def _emotion_counts(memories: list[dict[str, Any]]) -> dict[str, int]:
    """Aggregate emotion keyword hits across all memory texts.

    Args:
        memories: List of memory dicts, each expected to have a ``text`` key.

    Returns:
        Dict mapping each emotion category name to its total keyword hit count.
    """
    counts: dict[str, int] = {cat: 0 for cat in _EMOTIONAL_KEYWORDS}
    for mem in memories:
        text = mem.get("text") or ""
        tokens = _tokenise(text)
        for cat, keywords in _EMOTIONAL_KEYWORDS.items():
            counts[cat] += _count_keywords(tokens, keywords)
    return counts


def _recency_weight(created_at: str | None) -> float:
    """Compute a recency weight in ``(0.0, 1.0]`` from an ISO-8601 timestamp.

    More recent memories receive a weight closer to 1.0.  The decay is linear
    over a 90-day window; anything older than 90 days receives ``0.05``.

    Args:
        created_at: ISO-8601 date/datetime string (e.g. ``"2026-04-01"``), or
            ``None`` to return the neutral weight ``0.5``.

    Returns:
        Float in ``(0.0, 1.0]``.
    """
    if not created_at:
        return 0.5
    try:
        ts_str = str(created_at).replace("Z", "+00:00")
        # Accept both "YYYY-MM-DD" and full datetime strings
        if "T" in ts_str or " " in ts_str:
            dt = datetime.fromisoformat(ts_str)
        else:
            dt = datetime.fromisoformat(ts_str + "T00:00:00+00:00")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(tz=timezone.utc)
        age_days = max(0.0, (now - dt).total_seconds() / 86_400.0)
        weight = max(0.05, 1.0 - age_days / 90.0)
        return weight
    except Exception:
        return 0.5


def _score_memory(mem: dict[str, Any]) -> float:
    """Compute a combined relevance score for ranking.

    Score = salience * recency_weight.

    Args:
        mem: Memory dict with optional ``salience`` (float) and ``created_at``
            (str) keys.

    Returns:
        Float score used for ranking; higher is more relevant.
    """
    salience = float(mem.get("salience") or 0.5)
    recency = _recency_weight(mem.get("created_at"))
    return salience * recency


def _extract_fact_snippet(text: str) -> str | None:
    """Extract a short, human-readable fact snippet from memory *text*.

    Strips filler phrasing and returns a snippet ≤ 80 characters, or ``None``
    if the text is too short to form a useful reference.

    Args:
        text: Raw memory text string.

    Returns:
        Trimmed snippet string or ``None`` when the text is not useful.
    """
    if not text:
        return None
    text = text.strip()
    if len(text) < 10:
        return None
    # Truncate at sentence boundary or 80 chars, whichever comes first.
    for sep in (".", "!", "?", "\n"):
        idx = text.find(sep)
        if 0 < idx <= 80:
            snippet = text[: idx + 1].strip()
            return snippet if len(snippet) >= 10 else None
    return text[:80].rstrip() if len(text) > 80 else text


def _detect_continuity_elements(memories: list[dict[str, Any]]) -> list[str]:
    """Find inside jokes, pet names, and repeated callback phrases.

    Looks for pet-name patterns and counts two-to-three-word phrase repetitions
    across memories that occur more than once — a heuristic proxy for shared
    references and recurring in-jokes.

    Args:
        memories: List of memory dicts with ``text`` keys.

    Returns:
        List of up to 3 distinct continuity element strings.
    """
    elements: list[str] = []
    seen: set[str] = set()

    # --- Pet names / terms of endearment ---
    for mem in memories:
        text = mem.get("text") or ""
        for match in _PET_NAME_RE.finditer(text):
            phrase = match.group(0).lower()
            if phrase not in seen:
                seen.add(phrase)
                elements.append(f'Uses "{match.group(0)}"')
                if len(elements) >= 3:
                    return elements

    # --- Repeated bigrams / trigrams as inside-reference proxy ---
    phrase_counts: dict[str, int] = {}
    for mem in memories:
        text = mem.get("text") or ""
        tokens = _tokenise(text)
        # Bigrams
        for i in range(len(tokens) - 1):
            bg = f"{tokens[i]} {tokens[i + 1]}"
            phrase_counts[bg] = phrase_counts.get(bg, 0) + 1
        # Trigrams
        for i in range(len(tokens) - 2):
            tg = f"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}"
            phrase_counts[tg] = phrase_counts.get(tg, 0) + 1

    # Recurring phrases (count >= 2) that are not trivially short stop-words
    stopwords = {"the", "a", "an", "is", "it", "in", "on", "of", "to", "and",
                 "i", "you", "we", "they", "he", "she", "my", "your", "that"}
    for phrase, count in sorted(phrase_counts.items(), key=lambda x: -x[1]):
        if count < 2:
            break
        words = phrase.split()
        if all(w in stopwords for w in words):
            continue
        if phrase not in seen:
            seen.add(phrase)
            elements.append(f'Recurring theme: "{phrase}"')
            if len(elements) >= 3:
                break

    return elements[:3]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def derive_behavior_from_memories(
    retrieved_memories: list[dict[str, Any]],
    user_profile: dict[str, Any],
    current_context: str,
) -> dict[str, Any]:
    """Derive behavioral instructions from retrieved memories and user preferences.

    Analyses *retrieved_memories* and *user_profile* to produce four behavioral
    channels that guide how the character should respond in the current turn.
    No LLM calls or DB queries are made — all logic is pure heuristics.

    Args:
        retrieved_memories: List of memory dicts as returned by
            :meth:`~backend.memory.tiered_memory.TieredMemoryManager.search`.
            Each dict is expected to have:

            - ``text`` (str): Raw memory content.
            - ``tier`` (int): Memory tier (1=fleeting, 2=recent, 3=permanent).
            - ``salience`` (float): Importance weight 0.0–1.0.
            - ``role`` (str): ``"user"`` or ``"assistant"``.
            - ``created_at`` (str | None): ISO-8601 timestamp.

        user_profile: Dict from the ``user_profiles`` table.  Relevant keys:

            - ``pref_humor`` (float 0–1): User's preference for playful tone.
            - ``pref_formality`` (float 0–1): Formal vs. casual style preference.
            - ``pref_empathy`` (float 0–1): How much emotional support the user
              typically seeks.
            - ``pref_depth`` (float 0–1): Preference for deep/philosophical talk.

        current_context: Detected conversation context string, e.g.
            ``"casual_chat"``, ``"emotional_support"``, ``"deep_conversation"``.
            Used to weight behavioral channels appropriately.

    Returns:
        Dict with four keys:

        - ``emotional_coloring`` (str): Tone guidance sentence, or ``""`` when
          no dominant emotion is detected.
        - ``behavioral_priming`` (str): Style guidance sentence, or ``""`` when
          no strong preference applies.
        - ``proactive_references`` (list[str]): Up to 2 fact snippets that can
          be naturally brought up in the reply.
        - ``relationship_continuity`` (list[str]): Up to 3 shared elements
          (pet names, recurring themes) that reinforce the bond.

    Example:
        >>> mems = [
        ...     {
        ...         "text": "User said their cat Mochi is sick and they are very sad",
        ...         "tier": 2,
        ...         "salience": 0.8,
        ...         "role": "user",
        ...         "created_at": "2026-04-05",
        ...     }
        ... ]
        >>> result = derive_behavior_from_memories(
        ...     mems, {"pref_empathy": 0.9}, "emotional_support"
        ... )
        >>> result["emotional_coloring"]
        'approach with gentleness'
        >>> result["proactive_references"]  # doctest: +ELLIPSIS
        [...]
    """
    # Gracefully handle empty or None inputs
    if not retrieved_memories:
        retrieved_memories = []
    if not user_profile:
        user_profile = {}
    current_context = (current_context or "").strip().lower()

    # -----------------------------------------------------------------------
    # Channel 1: emotional_coloring
    # -----------------------------------------------------------------------
    emotional_coloring = ""

    if retrieved_memories:
        emotion_counts = _emotion_counts(retrieved_memories)
        dominant = max(emotion_counts, key=lambda c: emotion_counts[c])
        dominant_count = emotion_counts[dominant]

        if dominant_count > 0:
            # Check for mixed emotions (two categories with similar counts)
            sorted_counts = sorted(emotion_counts.values(), reverse=True)
            second_count = sorted_counts[1] if len(sorted_counts) > 1 else 0
            is_mixed = dominant_count > 0 and second_count > 0 and second_count >= dominant_count * 0.6

            if is_mixed:
                emotional_coloring = "be attentive to mood shifts"
            elif dominant == "sadness":
                emotional_coloring = "approach with gentleness"
            elif dominant == "excitement":
                emotional_coloring = "match their energy"
            elif dominant == "anxiety":
                emotional_coloring = "offer calm reassurance"
            elif dominant == "comfort":
                emotional_coloring = "maintain the warm, relaxed atmosphere"

    # Override for emotional support context when any sadness/anxiety present
    if current_context == "emotional_support" and not emotional_coloring:
        emotional_coloring = "approach with gentleness"

    # -----------------------------------------------------------------------
    # Channel 2: behavioral_priming
    # -----------------------------------------------------------------------
    behavioral_priming = ""

    pref_humor = float(user_profile.get("pref_humor") or 0.0)
    pref_depth = float(user_profile.get("pref_depth") or 0.0)
    pref_empathy = float(user_profile.get("pref_empathy") or 0.0)
    pref_formality = float(user_profile.get("pref_formality") or 0.0)

    # Detect if memories contain humor signals
    humor_hit = False
    depth_hit = False
    for mem in retrieved_memories:
        text = mem.get("text") or ""
        tokens_lower = text.lower().split()
        if any(w in _HUMOR_INDICATORS for w in tokens_lower):
            humor_hit = True
        tokens = _tokenise(text)
        if _count_keywords(tokens, _DEPTH_INDICATORS) >= 1:
            depth_hit = True

    if humor_hit and pref_humor > 0.6:
        behavioral_priming = "use playful callbacks"
    elif depth_hit and pref_depth > 0.6:
        behavioral_priming = "engage thoughtfully"
    elif pref_empathy > 0.7 and current_context in (
        "emotional_support", "casual_chat", ""
    ):
        behavioral_priming = "lead with warmth and understanding"
    elif "pref_formality" in user_profile and pref_formality < 0.3:
        behavioral_priming = "keep the tone casual and friendly"

    # -----------------------------------------------------------------------
    # Channel 3: proactive_references
    # -----------------------------------------------------------------------
    proactive_references: list[str] = []

    if retrieved_memories:
        # Rank memories by combined salience * recency score
        ranked = sorted(retrieved_memories, key=_score_memory, reverse=True)
        for mem in ranked:
            snippet = _extract_fact_snippet(mem.get("text") or "")
            if snippet and snippet not in proactive_references:
                proactive_references.append(snippet)
            if len(proactive_references) >= 2:
                break

    # -----------------------------------------------------------------------
    # Channel 4: relationship_continuity
    # -----------------------------------------------------------------------
    relationship_continuity = _detect_continuity_elements(retrieved_memories)

    result: dict[str, Any] = {
        "emotional_coloring": emotional_coloring,
        "behavioral_priming": behavioral_priming,
        "proactive_references": proactive_references,
        "relationship_continuity": relationship_continuity,
    }

    logger.debug(
        "derive_behavior_from_memories: context=%r coloring=%r priming=%r refs=%d continuity=%d",
        current_context,
        emotional_coloring,
        behavioral_priming,
        len(proactive_references),
        len(relationship_continuity),
    )

    return result


def build_memory_behavior_block(behavior: dict[str, Any]) -> str:
    """Render a behavior dict as a compact prompt-injectable text block.

    Produces a ``[Memory-driven behavior]`` section that can be appended to the
    character's system prompt.  The block is intentionally terse — target budget
    is under 80 tokens.

    Returns an empty string when all channels are effectively empty so callers
    can skip injection cleanly.

    Args:
        behavior: Dict as returned by :func:`derive_behavior_from_memories`.
            Expected keys: ``emotional_coloring`` (str), ``behavioral_priming``
            (str), ``proactive_references`` (list[str]),
            ``relationship_continuity`` (list[str]).

    Returns:
        A multi-line string ready for prompt injection, or ``""`` when every
        channel is empty.

    Example:
        >>> b = {
        ...     "emotional_coloring": "approach with gentleness",
        ...     "behavioral_priming": "lead with warmth and understanding",
        ...     "proactive_references": ["User mentioned their cat Mochi is sick."],
        ...     "relationship_continuity": [],
        ... }
        >>> block = build_memory_behavior_block(b)
        >>> block.startswith("[Memory-driven behavior]")
        True
        >>> "approach with gentleness" in block
        True
    """
    if not behavior:
        return ""

    coloring: str = (behavior.get("emotional_coloring") or "").strip()
    priming: str = (behavior.get("behavioral_priming") or "").strip()
    refs: list[str] = [r for r in (behavior.get("proactive_references") or []) if r]
    continuity: list[str] = [c for c in (behavior.get("relationship_continuity") or []) if c]

    # If every channel is empty return nothing — no point injecting blank block.
    if not any([coloring, priming, refs, continuity]):
        return ""

    lines: list[str] = ["[Memory-driven behavior]"]

    if coloring:
        lines.append(f"Emotional tone: {coloring}")
    if priming:
        lines.append(f"Style: {priming}")
    if refs:
        lines.append(f"Can reference: {'; '.join(refs)}")
    if continuity:
        lines.append(f"Shared history: {'; '.join(continuity)}")

    return "\n".join(lines)
