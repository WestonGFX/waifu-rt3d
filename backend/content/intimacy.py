"""Regex-based intimacy scoring and physical state tracking.

Ported from AnimeGirly's TypeScript intimacy engine.  Each conversation turn
is evaluated against five pattern groups — flirty, romantic, physical, explicit,
and cooling — to produce a signed delta that is applied to the running
``IntimacyState.level``.  A separate ``PhysicalState`` tracks clothing changes,
positional context, and a 0–10 arousal score derived from explicit pattern hits.

The public surface is intentionally small:

* :func:`evaluate_intimacy_shift` — main per-turn scorer.
* :func:`detect_physical_actions` — extract ``*action*`` markers from text.
* :func:`update_physical_state` — update clothing, position, and arousal.

All regex patterns are compiled once at module import as module-level constants.

Example:
    >>> from backend.content.types import IntimacyState
    >>> from backend.content.intimacy import evaluate_intimacy_shift
    >>> state = IntimacyState()
    >>> new_state = evaluate_intimacy_shift(
    ...     state,
    ...     user_msg="You look so beautiful tonight",
    ...     assistant_msg="*blushes* Thank you, darling~",
    ...     ceiling="mature",
    ... )
    >>> new_state.level > 0
    True
    >>> new_state.trend
    'rising'
"""

from __future__ import annotations

import re
from typing import Literal

from backend.content.types import (
    CEILING_MAX_INTIMACY,
    IntimacyState,
    PhysicalState,
)

# ---------------------------------------------------------------------------
# Intimacy pattern groups
# Each list element is one compiled pattern.  During scoring we count how many
# *patterns* fire (not how many individual word-hits), so a single pattern
# matching three times still contributes only one match to the count.
# ---------------------------------------------------------------------------

#: Flirty signals — +2 per matched pattern.
FLIRTY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(cute|adorable|beautiful|gorgeous|pretty|handsome|hot)\b", re.I),
    re.compile(r"\b(wink|blush|tease|flirt|smirk)\b", re.I),
    re.compile(r"\b(miss you|thinking about you|can't stop thinking)\b", re.I),
    re.compile(r"\*\s*(winks?|blush(?:es)?|smirks?|giggles?)\s*\*", re.I),
]

#: Romantic signals — +3 per matched pattern.
ROMANTIC_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(love you|i love|my love|darling|sweetheart|baby|babe)\b", re.I),
    re.compile(r"\b(heart|hearts|heartbeat|butterflies)\b", re.I),
    re.compile(r"\b(kiss|kissed|kissing|cuddle|cuddling|embrace|hold me)\b", re.I),
    re.compile(r"\*\s*(kisses?|hugs?|embraces?|holds? (?:you|your|close))\s*\*", re.I),
]

#: Physical signals — +4 per matched pattern.
PHYSICAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(touch|touches|touching|caress|stroke|press(?:es)?)\b", re.I),
    re.compile(r"\b(body|skin|lips|neck|shoulder|waist|hip|thigh|chest)\b", re.I),
    re.compile(r"\b(closer|against|on top|beneath|between)\b", re.I),
    re.compile(
        r"\*\s*(leans?|pulls?|presses?|runs? (?:hand|finger)|places? (?:hand|palm))\s*\*",
        re.I,
    ),
    re.compile(r"\b(undress|remove|take off|unbutton|slip off)\b", re.I),
]

#: Explicit signals — +5 per matched pattern.
EXPLICIT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(moan(?:s|ed|ing)?|groan(?:s|ed|ing)?|gasp(?:s|ed|ing)?|pant(?:s|ed|ing)?|whimper(?:s|ed|ing)?|cry(?:ing)? out|cries out)\b", re.I),
    re.compile(r"\b(thrust(?:s|ing)?|grind(?:s|ing)?|rock(?:s|ing)?|arch(?:es|ed|ing)?|squeeze(?:s|d|ing)?|grip(?:s|ped|ping)?)\b", re.I),
    re.compile(r"\b(naked|nude|bare|exposed|undressed)\b", re.I),
]

#: Cooling/de-escalation signals — -3 per matched pattern.
COOLING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(stop|don't|no|wait|slow down|not now|please don't)\b", re.I),
    re.compile(r"\b(friend|buddy|pal|just friends|platonic)\b", re.I),
    re.compile(r"\b(uncomfortable|weird|awkward|inappropriate)\b", re.I),
]

# ---------------------------------------------------------------------------
# Physical-state patterns
# ---------------------------------------------------------------------------

#: Patterns that detect clothing being removed or loosened.
#: Group 1 = verb phrase, Group 2 = garment description.
CLOTHING_CHANGE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"\b(takes? off|removes?|unbuttons?|slips? off|pulls? (?:down|off)|unzips?)"
        r"\s+(?:(?:his|her|my|your|the)\s+)?(\w[\w\s]*)",
        re.I,
    ),
    re.compile(
        r"\b(puts? on|wears?|buttons?|zips?)"
        r"\s+(?:(?:his|her|my|your|the)\s+)?(\w[\w\s]*)",
        re.I,
    ),
]

#: Patterns that detect changes in spatial position / location.
#: Group 1 = movement verb, Group 2 = target location.
POSITION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"\b(sit(?:s|ting)?|stand(?:s|ing)?|l(?:ies?|ying|ays?)|kneel(?:s|ing)?)"
        r"\s+(?:on|in|at|beside|next to|against)\s+(?:the\s+)?(\w[\w\s]*)",
        re.I,
    ),
    re.compile(
        r"\b(moves? to|walks? to|goes? to|climbs? (?:on|into)|gets? (?:on|into|in))"
        r"\s+(?:the\s+)?(\w[\w\s]*)",
        re.I,
    ),
]

#: Regex used by :func:`detect_physical_actions` to extract ``*action*`` spans.
_ACTION_RE: re.Pattern[str] = re.compile(r"\*([^*]+)\*")

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_CLAMPED_DELTA_MIN: int = -5
_CLAMPED_DELTA_MAX: int = 5
_NATURAL_DECAY: int = -1
_AROUSAL_MAX: int = 10
_AROUSAL_FLOOR: int = 0
_RECENT_ACTIONS_WINDOW: int = 5
_ACTION_TEXT_MIN_LEN: int = 3
_ACTION_TEXT_MAX_LEN: int = 200

ContentCeiling = Literal["general", "edgy", "mature", "explicit"]
PsychologyPhase = Literal["early", "developing", "bonded", "detaching", "post_breakup"]

#: Psychology phases that force a hard cap of 30 on intimacy regardless of ceiling.
_LOW_CAP_PHASES: frozenset[str] = frozenset({"detaching", "post_breakup"})
_PHASE_CAP_HARD: int = 30


def _count_matches(patterns: list[re.Pattern[str]], text: str) -> int:
    """Return the number of patterns in *patterns* that fire at least once in *text*.

    Counts unique pattern fires, not total word-level hits.  A pattern that
    matches three times still contributes 1 to the count.

    Args:
        patterns: Compiled regex patterns to test.
        text: The combined user + assistant message text to search.

    Returns:
        Integer count of patterns with at least one match.

    Example:
        >>> import re
        >>> pats = [re.compile(r"\\bhello\\b", re.I), re.compile(r"\\bworld\\b", re.I)]
        >>> _count_matches(pats, "Hello world hello")
        2
        >>> _count_matches(pats, "hello hello hello")
        1
    """
    return sum(1 for p in patterns if p.search(text))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_intimacy_shift(
    state: IntimacyState,
    user_msg: str,
    assistant_msg: str,
    ceiling: ContentCeiling,
    psychology_phase: PsychologyPhase | None = None,
) -> IntimacyState:
    """Compute the next ``IntimacyState`` after one conversation turn.

    Combines *user_msg* and *assistant_msg* into a single text block, counts
    unique pattern-group fires across all five groups, and converts those
    counts into a signed delta.  The delta is clamped to ``[-5, +5]`` before
    being applied, and the resulting level is clamped to
    ``[0, max_intimacy]`` where *max_intimacy* is determined by the content
    ceiling and (optionally) the active psychology phase.

    Scoring weights:
        * Flirty    → +2 per matched pattern
        * Romantic  → +3 per matched pattern
        * Physical  → +4 per matched pattern
        * Explicit  → +5 per matched pattern
        * Cooling   → -3 per matched pattern
        * No positive signals anywhere → natural decay of -1

    Args:
        state: Current ``IntimacyState`` before this turn.
        user_msg: The user's message text for this turn.
        assistant_msg: The assistant's response text for this turn.
        ceiling: The effective content-rating ceiling (e.g. ``"mature"``).
            Controls the hard upper bound via :data:`CEILING_MAX_INTIMACY`.
        psychology_phase: Optional relationship phase string.  When set to
            ``"detaching"`` or ``"post_breakup"`` the level is capped at 30
            regardless of the ceiling tier.

    Returns:
        A new ``IntimacyState`` instance with the updated ``level``, ``trend``,
        and incremented ``last_update_turn``.  The input *state* is not mutated.

    Example:
        >>> from backend.content.types import IntimacyState
        >>> s = IntimacyState(level=10, trend="stable", last_update_turn=0)
        >>> s2 = evaluate_intimacy_shift(
        ...     s,
        ...     user_msg="You look so beautiful tonight",
        ...     assistant_msg="*blushes* Thank you, darling~",
        ...     ceiling="mature",
        ... )
        >>> s2.level > s.level
        True
        >>> s2.trend
        'rising'
        >>> s2.last_update_turn
        1
    """
    combined_text = user_msg + "\n" + assistant_msg

    # Count unique pattern fires per group.
    flirty_count = _count_matches(FLIRTY_PATTERNS, combined_text)
    romantic_count = _count_matches(ROMANTIC_PATTERNS, combined_text)
    physical_count = _count_matches(PHYSICAL_PATTERNS, combined_text)
    explicit_count = _count_matches(EXPLICIT_PATTERNS, combined_text)
    cooling_count = _count_matches(COOLING_PATTERNS, combined_text)

    positive_total = flirty_count + romantic_count + physical_count + explicit_count

    # Compute raw delta.
    delta: int = (
        2 * flirty_count
        + 3 * romantic_count
        + 4 * physical_count
        + 5 * explicit_count
        - 3 * cooling_count
    )

    # If no positive signal at all, apply natural decay.
    if positive_total == 0:
        delta = _NATURAL_DECAY

    # Clamp delta to [-5, +5].
    delta = max(_CLAMPED_DELTA_MIN, min(_CLAMPED_DELTA_MAX, delta))

    # Resolve max_intimacy from ceiling + phase.
    ceiling_max = CEILING_MAX_INTIMACY[ceiling]
    phase_max = _PHASE_CAP_HARD if (psychology_phase in _LOW_CAP_PHASES) else 100
    max_intimacy = min(ceiling_max, phase_max)

    # Apply delta and clamp level.
    next_level = max(0, min(state.level + delta, max_intimacy))

    # Determine trend.
    if delta > 0:
        trend: Literal["rising", "stable", "cooling"] = "rising"
    elif delta < 0:
        trend = "cooling"
    else:
        trend = "stable"

    return IntimacyState(
        level=next_level,
        trend=trend,
        last_update_turn=state.last_update_turn + 1,
    )


def detect_physical_actions(message: str) -> list[str]:
    """Extract ``*action text*`` markers from *message*.

    Scans for all ``*...*`` spans and returns those whose inner text is between
    3 and 200 characters (exclusive on both bounds), filtering out trivially
    short or suspiciously long matches.

    Args:
        message: A single message string (user or assistant turn).

    Returns:
        List of action description strings, in order of appearance, with the
        surrounding asterisks stripped.  May be empty.

    Example:
        >>> detect_physical_actions("Hello *waves* there *smiles warmly* at you")
        ['waves', 'smiles warmly']
        >>> detect_physical_actions("No actions here")
        []
        >>> detect_physical_actions("*x*")  # too short (len==1)
        []
    """
    return [
        m.group(1).strip()
        for m in _ACTION_RE.finditer(message)
        if _ACTION_TEXT_MIN_LEN < len(m.group(1).strip()) < _ACTION_TEXT_MAX_LEN
    ]


def update_physical_state(
    current_state: PhysicalState,
    user_msg: str,
    assistant_msg: str,
) -> PhysicalState:
    """Return a new ``PhysicalState`` updated from one conversation turn.

    Three aspects are tracked:

    1. **Clothing changes** — the first CLOTHING_CHANGE_PATTERNS hit in the
       combined text updates :attr:`~PhysicalState.companion_clothing` with a
       short description built from the verb and garment phrases.
    2. **Position changes** — the first POSITION_PATTERNS hit updates
       :attr:`~PhysicalState.physical_context`.
    3. **Recent actions** — ``*action*`` markers from both messages are
       appended to the rolling window and trimmed to the last 5 entries.
    4. **Arousal** — if any EXPLICIT_PATTERNS fire, ``arousal_level`` is
       incremented by 1 (capped at 10); otherwise it decays by 1 (floored at 0).

    The input *current_state* is not mutated; a new instance is returned.

    Args:
        current_state: The ``PhysicalState`` from the previous turn.
        user_msg: The user's message text for this turn.
        assistant_msg: The assistant's response text for this turn.

    Returns:
        A new ``PhysicalState`` with updated fields.

    Example:
        >>> from backend.content.types import PhysicalState
        >>> ps = PhysicalState()
        >>> new_ps = update_physical_state(
        ...     ps,
        ...     user_msg="*leans in close*",
        ...     assistant_msg="*blushes*",
        ... )
        >>> "leans in close" in new_ps.recent_actions
        True
        >>> new_ps.arousal_level
        0
    """
    combined_text = user_msg + "\n" + assistant_msg

    # --- Clothing ---
    new_clothing = current_state.companion_clothing
    for pattern in CLOTHING_CHANGE_PATTERNS:
        m = pattern.search(combined_text)
        if m:
            verb = m.group(1).strip()
            garment = m.group(2).strip().rstrip(".,;!?")
            new_clothing = f"{verb} {garment}"
            break  # first match wins

    # --- Position ---
    new_position = current_state.physical_context
    for pattern in POSITION_PATTERNS:
        m = pattern.search(combined_text)
        if m:
            verb = m.group(1).strip()
            location = m.group(2).strip().rstrip(".,;!?")
            new_position = f"{verb} {location}"
            break  # first match wins

    # --- Recent actions (rolling window of 5) ---
    new_actions: list[str] = list(current_state.recent_actions)
    new_actions.extend(detect_physical_actions(user_msg))
    new_actions.extend(detect_physical_actions(assistant_msg))
    new_actions = new_actions[-_RECENT_ACTIONS_WINDOW:]

    # --- Arousal ---
    explicit_fires = _count_matches(EXPLICIT_PATTERNS, combined_text)
    if explicit_fires > 0:
        new_arousal = min(current_state.arousal_level + 1, _AROUSAL_MAX)
    else:
        new_arousal = max(current_state.arousal_level - 1, _AROUSAL_FLOOR)

    return PhysicalState(
        user_clothing=current_state.user_clothing,
        companion_clothing=new_clothing,
        physical_context=new_position,
        arousal_level=new_arousal,
        recent_actions=new_actions,
        last_updated_at=current_state.last_updated_at,
    )
