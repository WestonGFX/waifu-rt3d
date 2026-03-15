"""Prompt template macro expansion for character system prompts.

Expands ``{{macro}}`` placeholders in system prompt text with dynamic
runtime values. Gives character card authors access to context like
the current time, character name, relationship status, etc. without
hardcoding values.

Inspired by SillyTavern/RisuAI macro systems. Unknown macros are
left as-is so they don't break prompts that use literal ``{{braces}}``.

Supported macros:
    {{char_name}}         Character display name
    {{user_name}}         User display name (from config)
    {{time}}              Current time (HH:MM)
    {{date}}              Current date (YYYY-MM-DD)
    {{day}}               Day of week (Monday, Tuesday, ...)
    {{mood}}              Character's current mood/emotion
    {{trust_level}}       Affinity tier (stranger → soulmate)
    {{message_count}}     Total messages in current session
    {{relationship_days}} Days since first_chat_date
"""

import re
from datetime import datetime


# ── Affinity tier thresholds (same as frontend affinityTier()) ────────────

_AFFINITY_TIERS = [
    (80, "soulmate"),
    (60, "close_friend"),
    (40, "friend"),
    (20, "acquaintance"),
    (0, "stranger"),
]


def _affinity_to_tier(affinity: float) -> str:
    """Convert a 0-100 affinity score to a named relationship tier.

    Args:
        affinity: Numeric affinity score (0.0 to 100.0).

    Returns:
        Tier label: 'stranger', 'acquaintance', 'friend',
        'close_friend', or 'soulmate'.

    Example:
        >>> _affinity_to_tier(75.0)
        'close_friend'
        >>> _affinity_to_tier(95.0)
        'soulmate'
    """
    for threshold, tier in _AFFINITY_TIERS:
        if affinity >= threshold:
            return tier
    return "stranger"


def expand_macros(text: str, context: dict) -> str:
    """Expand ``{{macro}}`` placeholders in system prompt text.

    Performs case-insensitive key lookup against the provided context
    dict. Unknown macros (keys not in context) are left untouched.

    Args:
        text: Raw system prompt with ``{{macro}}`` placeholders.
        context: Dict mapping lowercase macro names to string values.
            Common keys: ``char_name``, ``user_name``, ``time``,
            ``date``, ``day``, ``mood``, ``trust_level``,
            ``message_count``, ``relationship_days``.

    Returns:
        Text with all recognized macros expanded. Unknown macros
        are preserved verbatim (e.g. ``{{unknown}}`` stays as-is).

    Example:
        >>> ctx = {"char_name": "Mika", "time": "14:30"}
        >>> expand_macros("Hi, I'm {{char_name}}! It's {{time}}.", ctx)
        "Hi, I'm Mika! It's 14:30."
    """
    if "{{" not in text:
        return text

    def _replacer(match: re.Match) -> str:
        key = match.group(1).strip().lower()
        return str(context.get(key, match.group(0)))

    return re.sub(r"\{\{(\w+)\}\}", _replacer, text)


def build_macro_context(
    *,
    char_name: str = "",
    user_name: str = "",
    mood: str = "neutral",
    affinity: float = 0.0,
    message_count: int = 0,
    first_chat_date: str | None = None,
) -> dict[str, str]:
    """Build a macro context dict from character/session data.

    Centralises the mapping from runtime state to macro values so
    callers don't need to assemble it manually.

    Args:
        char_name: Character display name.
        user_name: User display name (from app config).
        mood: Character's current mood/emotion string.
        affinity: Affinity score 0-100.
        message_count: Total active messages in the current session.
        first_chat_date: ISO date string (YYYY-MM-DD) of first chat,
            or None if unknown.

    Returns:
        Dict mapping macro names (lowercase) to string values.

    Example:
        >>> ctx = build_macro_context(char_name="Fox", affinity=65.0)
        >>> ctx["trust_level"]
        'close_friend'
    """
    now = datetime.now()
    ctx: dict[str, str] = {
        "char_name": char_name,
        "user_name": user_name or "User",
        "time": now.strftime("%H:%M"),
        "date": now.strftime("%Y-%m-%d"),
        "day": now.strftime("%A"),
        "mood": mood or "neutral",
        "trust_level": _affinity_to_tier(affinity),
        "message_count": str(message_count),
    }

    # Relationship days
    if first_chat_date:
        try:
            first = datetime.strptime(first_chat_date, "%Y-%m-%d").date()
            days = (now.date() - first).days
            ctx["relationship_days"] = str(max(0, days))
        except (ValueError, TypeError):
            ctx["relationship_days"] = "0"
    else:
        ctx["relationship_days"] = "0"

    return ctx
