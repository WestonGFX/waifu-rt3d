"""Canonical emotion normalization for waifu-rt3d.

Provides a single source of truth for 26 canonical emotions, organized into
6 categories. All emotion strings across the system (LLM tags, HuggingFace
sentiment, voice modulator, expression portraits) should be normalized
through this module.

The alias map handles backwards compatibility — legacy names (Ekman labels,
ad-hoc synonyms, misspellings) all map to a canonical emotion.

Example:
    >>> from backend.emotion.normalize import normalize_emotion
    >>> normalize_emotion("joy")       # "happy" (alias)
    >>> normalize_emotion("anger")     # "angry" (alias)
    >>> normalize_emotion("flirty")    # "flirty" (canonical)
    >>> normalize_emotion("unknown")   # "neutral" (fallback)
"""

from __future__ import annotations

from typing import FrozenSet

# ---------------------------------------------------------------------------
# 26 Canonical Emotions — 6 Categories
# ---------------------------------------------------------------------------
# Core (Ekman+):  happy, sad, angry, surprised, fearful, disgusted, neutral
# Social:         embarrassed, shy, proud, confident, jealous, grateful
# Cognitive:      confused, curious, thoughtful, nostalgic, awe
# Romantic:       love, flirty, longing
# Energy:         excited, tired, relieved
# Playful:        smug, mischievous

CANONICAL_EMOTIONS: FrozenSet[str] = frozenset({
    # Core (Ekman+)
    "happy", "sad", "angry", "surprised", "fearful", "disgusted", "neutral",
    # Social
    "embarrassed", "shy", "proud", "confident", "jealous", "grateful",
    # Cognitive
    "confused", "curious", "thoughtful", "nostalgic", "awe",
    # Romantic
    "love", "flirty", "longing",
    # Energy
    "excited", "tired", "relieved",
    # Playful
    "smug", "mischievous",
})

# Grouped by category for UI rendering (ordered lists, not sets)
EMOTION_CATEGORIES: dict[str, list[str]] = {
    "Core": ["happy", "sad", "angry", "surprised", "fearful", "disgusted", "neutral"],
    "Social": ["embarrassed", "shy", "proud", "confident", "jealous", "grateful"],
    "Cognitive": ["confused", "curious", "thoughtful", "nostalgic", "awe"],
    "Romantic": ["love", "flirty", "longing"],
    "Energy": ["excited", "tired", "relieved"],
    "Playful": ["smug", "mischievous"],
}

# All 26 in a stable display order (category-grouped)
EMOTION_LIST: list[str] = [
    e for emotions in EMOTION_CATEGORIES.values() for e in emotions
]

# ---------------------------------------------------------------------------
# Alias Map — legacy/overlapping names → canonical
# ---------------------------------------------------------------------------
ALIAS_MAP: dict[str, str] = {
    # Ekman labels → canonical
    "joy":           "happy",
    "anger":         "angry",
    "surprise":      "surprised",
    "fear":          "fearful",
    "disgust":       "disgusted",
    "sadness":       "sad",
    # Synonyms / near-equivalents
    "contempt":      "disgusted",
    "anticipation":  "curious",
    "enthusiasm":    "excited",
    "irritation":    "angry",
    "warm":          "love",
    "tender":        "love",
    "affectionate":  "love",
    "loving":        "love",
    "nervous":       "fearful",
    "anxious":       "fearful",
    "calm":          "neutral",
    "serene":        "neutral",
    "playful":       "mischievous",
    "teasing":       "mischievous",
    "cool":          "confident",
    "serious":       "thoughtful",
    "thinking":      "thoughtful",
    "wonder":        "awe",
    "amazed":        "awe",
    "shock":         "surprised",
    "bored":         "tired",
    "sleepy":        "tired",
    "grateful":      "grateful",
    "thankful":      "grateful",
}


def normalize_emotion(raw: str) -> str:
    """Map any emotion string to one of the 26 canonical emotions.

    Performs case-insensitive lookup: first checks the alias map, then checks
    if the raw value is already canonical. Falls back to "neutral" for any
    unrecognized input.

    Args:
        raw: Raw emotion string from LLM tag, sentiment model, or user input.

    Returns:
        One of the 26 canonical emotion names.

    Example:
        >>> normalize_emotion("Joy")
        'happy'
        >>> normalize_emotion("ANGRY")
        'angry'
        >>> normalize_emotion("xyzzy")
        'neutral'
    """
    lowered = raw.strip().lower()
    # Check alias map first (handles legacy names)
    if lowered in ALIAS_MAP:
        return ALIAS_MAP[lowered]
    # Already canonical?
    if lowered in CANONICAL_EMOTIONS:
        return lowered
    return "neutral"


# Emoji representation for each canonical emotion (UI rendering)
EMOTION_EMOJI: dict[str, str] = {
    "happy":        "\U0001f60a",  # 😊
    "sad":          "\U0001f622",  # 😢
    "angry":        "\U0001f620",  # 😠
    "surprised":    "\U0001f632",  # 😲
    "fearful":      "\U0001f628",  # 😨
    "disgusted":    "\U0001f922",  # 🤢
    "neutral":      "\U0001f610",  # 😐
    "embarrassed":  "\U0001f633",  # 😳
    "shy":          "\U0001f97a",  # 🥺
    "proud":        "\U0001f60e",  # 😎
    "confident":    "\U0001f60f",  # 😏
    "jealous":      "\U0001f611",  # 😑
    "grateful":     "\U0001f64f",  # 🙏
    "confused":     "\U0001f615",  # 😕
    "curious":      "\U0001f9d0",  # 🧐
    "thoughtful":   "\U0001f914",  # 🤔
    "nostalgic":    "\U0001f60c",  # 😌
    "awe":          "\U0001f929",  # 🤩
    "love":         "\U0001f495",  # 💕
    "flirty":       "\U0001f609",  # 😉
    "longing":      "\U0001f614",  # 😔
    "excited":      "\U0001f525",  # 🔥
    "tired":        "\U0001f634",  # 😴
    "relieved":     "\U0001f60c",  # 😌
    "smug":         "\U0001f60f",  # 😏
    "mischievous":  "\U0001f608",  # 😈
}
