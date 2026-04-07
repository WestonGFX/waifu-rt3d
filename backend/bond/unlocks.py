"""Canonical unlock table for the Bond Progression System.

This module defines the complete set of features, dialogue modes, expressions,
story moments, and ceremonies that unlock as a user's bond level increases with
a character. It is a pure data module with no FastAPI or database dependencies.

The unlock table covers levels 0–100, with unlocks spaced more densely at low
levels (every level 0–18) to reward early engagement and more sparsely at high
levels (every 5–10 levels) to reflect the depth required to reach them.

Each unlock carries a type that describes how the companion system interprets it:

- ``"base"``      — Core conversation capability always present at level 0.
- ``"dialogue"``  — A new dialogue mode, topic pool, or linguistic register.
- ``"voiceline"`` — A character-specific voice narrative ("More About Me").
- ``"expression"``— A new facial expression unlocked in the VRM/avatar layer.
- ``"story"``     — A named bond story scene the user can trigger.
- ``"ceremony"``  — A tier-transition event with UI fanfare.
- ``"scene"``     — A named cinematic or memory scene.
- ``"feature"``   — A product feature gated behind bond depth.
- ``"cosmetic"``  — A UI cosmetic such as a namecard badge.

Tier boundaries and their visual colors are also exported here so the
progression UI and the API can share a single source of truth.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Unlock table
# ---------------------------------------------------------------------------

UNLOCK_TABLE: dict[int, list[dict[str, str]]] = {
    0:  [{"type": "base",       "key": "basic_conversation",     "label": "Basic conversation"}],
    1:  [{"type": "dialogue",   "key": "uses_your_name",         "label": "Character uses your name"}],
    2:  [{"type": "dialogue",   "key": "light_humor",            "label": "Light humor enabled"}],
    3:  [{"type": "voiceline",  "key": "about_me_1",             "label": '"More About Me: I"'}],
    4:  [{"type": "expression", "key": "curious_amused",          "label": "Curious + amused expressions"}],
    5:  [{"type": "story",      "key": "first_real_talk",         "label": 'Bond Story: "First Real Talk"'},
         {"type": "ceremony",   "key": "tier_acquaintance",       "label": "Tier Up: Stranger → Acquaintance"}],
    6:  [{"type": "dialogue",   "key": "tod_greetings",           "label": "Time-of-day personalized greetings"}],
    7:  [{"type": "dialogue",   "key": "initiates_topics",        "label": "Character initiates topics"}],
    8:  [{"type": "dialogue",   "key": "gift_hints",              "label": "Gift preference hints"}],
    9:  [{"type": "expression", "key": "embarrassed",             "label": "Embarrassed expression"}],
    10: [{"type": "story",      "key": "shared_interest",         "label": 'Bond Story: "Shared Interest"'}],
    11: [{"type": "voiceline",  "key": "about_me_2",             "label": '"More About Me: II"'}],
    12: [{"type": "expression", "key": "worried",                 "label": "Worried expression"}],
    13: [{"type": "dialogue",   "key": "pet_name_system",         "label": "Pet name system activates"}],
    14: [{"type": "dialogue",   "key": "comfort_dialogue",        "label": "Comfort dialogue"}],
    15: [{"type": "ceremony",   "key": "tier_friend",             "label": "Tier Up: Acquaintance → Friend"}],
    16: [{"type": "dialogue",   "key": "casual_style",            "label": "Casual dialogue style"}],
    17: [{"type": "dialogue",   "key": "dream_mentions",          "label": "Dream sequence mentions"}],
    18: [{"type": "expression", "key": "flustered",               "label": "Flustered expression"}],
    20: [{"type": "story",      "key": "opening_up",              "label": 'Bond Story: "Opening Up"'}],
    22: [{"type": "dialogue",   "key": "backstory_topics",        "label": "Backstory deep-dive topics"}],
    25: [{"type": "dialogue",   "key": "outfit_hint_1",           "label": "Outfit hint #1"}],
    27: [{"type": "expression", "key": "determined",              "label": "Determined expression"}],
    30: [{"type": "voiceline",  "key": "about_me_3",             "label": '"More About Me: III"'}],
    32: [{"type": "dialogue",   "key": "nostalgia_triggers",      "label": "Nostalgia triggers"}],
    34: [{"type": "scene",      "key": "our_first_memory",        "label": '"Our First Memory" scene'}],
    35: [{"type": "ceremony",   "key": "tier_close_friend",       "label": "Tier Up: Friend → Close Friend"}],
    36: [{"type": "dialogue",   "key": "whispered_register",      "label": "Intimate/whispered register"}],
    38: [{"type": "dialogue",   "key": "authentic_disagree",      "label": "Character disagrees authentically"}],
    40: [{"type": "expression", "key": "lovestruck",              "label": "Lovestruck expression"}],
    42: [{"type": "dialogue",   "key": "bidirectional_petnames",  "label": "Bidirectional pet names"}],
    45: [{"type": "dialogue",   "key": "exclusive_topics",        "label": "Exclusive conversation topics"}],
    48: [{"type": "expression", "key": "tearful",                 "label": "Tearful expression"}],
    50: [{"type": "story",      "key": "deep_connection",         "label": 'Bond Story: "Deep Connection"'}],
    52: [{"type": "voiceline",  "key": "about_me_4",             "label": '"More About Me: IV"'}],
    55: [{"type": "feature",    "key": "time_capsule",            "label": "Time capsule messages begin"}],
    60: [{"type": "dialogue",   "key": "distress_comfort",        "label": "Character comforts during distress"}],
    64: [{"type": "dialogue",   "key": "mysteries_hinted",        "label": "All mysteries hinted"}],
    65: [{"type": "ceremony",   "key": "tier_soulmate",           "label": "Tier Up: Close Friend → Soulmate"}],
    68: [{"type": "dialogue",   "key": "full_emotional_range",    "label": "Full emotional range"}],
    70: [{"type": "expression", "key": "secret_expression",       "label": "Secret expression unlock"}],
    75: [{"type": "feature",    "key": "anniversary_recognition", "label": "Anniversary recognition"}],
    80: [{"type": "voiceline",  "key": "about_me_5",             "label": '"More About Me: V"'}],
    85: [{"type": "dialogue",   "key": "growth_arc_resolves",     "label": "Character growth arc resolves"}],
    90: [{"type": "cosmetic",   "key": "soulmate_badge",          "label": "Soulmate namecard/badge"}],
    95: [{"type": "feature",    "key": "covenant_ceremony",       "label": "Covenant ceremony available"}],
    100: [{"type": "story",     "key": "covenant_story",          "label": 'Bond Story: "Covenant"'}],
}

# ---------------------------------------------------------------------------
# Tier metadata
# ---------------------------------------------------------------------------

TIER_NAMES: dict[str, str] = {
    "stranger":     "Stranger",
    "acquaintance": "Acquaintance",
    "friend":       "Friend",
    "close_friend": "Close Friend",
    "soulmate":     "Soulmate",
}

TIER_COLORS: dict[str, str] = {
    "stranger":     "#9ca3af",
    "acquaintance": "#60a5fa",
    "friend":       "#34d399",
    "close_friend": "#a78bfa",
    "soulmate":     "#fbbf24",
}

# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def get_unlocks_for_level(level: int) -> list[dict[str, str]]:
    """Return the unlocks defined for exactly this level.

    Args:
        level: The bond level to query (0–100).

    Returns:
        A list of unlock dicts for that level, or an empty list if no unlocks
        are defined at that exact level.

    Example:
        >>> get_unlocks_for_level(5)
        [{'type': 'story', 'key': 'first_real_talk', ...},
         {'type': 'ceremony', 'key': 'tier_acquaintance', ...}]
        >>> get_unlocks_for_level(19)
        []
    """
    return list(UNLOCK_TABLE.get(level, []))


def get_unlocked_features(current_level: int) -> list[dict[str, str]]:
    """Return all unlocks earned at or below current_level.

    Iterates the unlock table in ascending level order and collects every
    unlock whose trigger level is <= current_level. Each returned dict is a
    copy of the original entry augmented with a ``"level"`` key so callers
    can group or display them by level.

    Args:
        current_level: The user's current bond level (0–100).

    Returns:
        A flat list of unlock dicts sorted by ascending level. Each dict
        contains the original ``type``, ``key``, and ``label`` fields plus
        an additional ``"level"`` key (string representation of the int).

    Example:
        >>> features = get_unlocked_features(5)
        >>> [f['key'] for f in features]
        ['basic_conversation', 'uses_your_name', 'light_humor',
         'about_me_1', 'curious_amused', 'first_real_talk', 'tier_acquaintance']
    """
    result: list[dict[str, str]] = []
    for lvl in sorted(UNLOCK_TABLE.keys()):
        if lvl > current_level:
            break
        for unlock in UNLOCK_TABLE[lvl]:
            entry = dict(unlock)
            entry["level"] = str(lvl)
            result.append(entry)
    return result


def get_next_unlock(current_level: int) -> dict[str, str] | None:
    """Return the first unlock that has not yet been earned.

    Scans the unlock table for the lowest level strictly greater than
    current_level and returns its first entry (augmented with a ``"level"``
    key). Returns ``None`` when the user has reached the maximum level and
    all unlocks have been earned.

    Args:
        current_level: The user's current bond level (0–100).

    Returns:
        A single unlock dict (with ``type``, ``key``, ``label``, and
        ``"level"``) for the next milestone, or ``None`` if no further
        unlocks exist.

    Example:
        >>> nxt = get_next_unlock(4)
        >>> nxt['key']
        'first_real_talk'
        >>> nxt['level']
        '5'
        >>> get_next_unlock(100) is None
        True
    """
    for lvl in sorted(UNLOCK_TABLE.keys()):
        if lvl > current_level:
            entry = dict(UNLOCK_TABLE[lvl][0])
            entry["level"] = str(lvl)
            return entry
    return None
