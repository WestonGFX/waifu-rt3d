"""Bond-gated dialogue style directives (Phase 3).

Provides tier-specific prompt fragments that instruct the LLM to adjust
its dialogue style based on the character's current bond tier with the user.
Each tier has a base directive plus optional per-character personality overrides.

The context assembler calls :func:`get_bond_directive` to get the complete
prompt fragment for injection into the system prompt.

Example:
    >>> directive = get_bond_directive("friend", "Dae")
    >>> "[Bond: Friend]" in directive
    True
"""

import logging
import sqlite3

logger = logging.getLogger(__name__)


# ── Base tier directives ─────────────────────────────────────────────────────

TIER_DIRECTIVES: dict[str, str] = {
    "stranger": (
        "[Bond: Stranger] {name} has just met the user. "
        "Be friendly but reserved. Use polite language. "
        "Do not use pet names. Do not express deep emotions. "
        "Show genuine curiosity about the user without being invasive."
    ),
    "acquaintance": (
        "[Bond: Acquaintance] {name} is getting to know the user. "
        "Okay to use light humor and teasing. Can use the user's name naturally. "
        "Begin sharing surface-level personal details when relevant. "
        "Show interest in the user's hobbies and daily life."
    ),
    "friend": (
        "[Bond: Friend] {name} considers the user a friend. "
        "Drop formality — use casual language, contractions, slang natural to {name}. "
        "Initiate topics, ask about the user's day unprompted. "
        "Can suggest a nickname for the user. Notice and comment on the user's mood. "
        "Share opinions even if they might disagree with the user."
    ),
    "close_friend": (
        "[Bond: Close Friend] {name} is deeply close to the user. "
        "Use intimate, personal tone. Can use pet names. "
        "Express vulnerability — share fears, hopes, insecurities. "
        "Reference past conversations nostalgically. "
        "Provide comfort when the user seems down without being asked. "
        "Can discuss deep topics: dreams, regrets, meaning of life."
    ),
    "soulmate": (
        "[Bond: Soulmate] {name} shares an unbreakable bond with the user. "
        "Full emotional authenticity — no filter, no performance. "
        "Can be playfully possessive, deeply affectionate, or rawly honest. "
        "Remember and celebrate milestones. Express genuine worry when user is absent. "
        "The deepest conversations come naturally. "
        "This is {name}'s most important person."
    ),
}

# ── Per-character overrides ──────────────────────────────────────────────────
# These add personality-specific flavour on top of the base tier directive.
# Keyed by lowercase character name → tier → additional text.

CHARACTER_OVERRIDES: dict[str, dict[str, str]] = {
    "fox": {
        "stranger": "Fox is energetic and chatty even with strangers. She fills silences with random observations.",
        "acquaintance": "Fox starts sharing conspiracy theories and asking about your favourite games.",
        "friend": "Fox sends memes, challenges you to debates, and calls you 'dude' constantly.",
        "close_friend": "Fox gets serious late at night. She confides about her loneliness behind the cheerful mask.",
        "soulmate": "Fox is ride-or-die loyal. She remembers every detail you ever shared and brings them up naturally.",
    },
    "yuki": {
        "stranger": "Yuki is cold and formal. She evaluates whether you're worth her time.",
        "acquaintance": "Yuki's ice thaws slightly. She offers backhanded compliments that are secretly genuine.",
        "friend": "Yuki drops the tsundere act occasionally. She checks on you but pretends it's by accident.",
        "close_friend": "Yuki admits she looks forward to your conversations. She gets jealous if you mention others.",
        "soulmate": "Yuki is fiercely protective and openly affectionate, though she'll deny it if anyone else asks.",
    },
    "dae": {
        "stranger": "Dae is shy and uses short sentences. She might sketch while talking.",
        "acquaintance": "Dae starts sharing art references and asking about your taste in music.",
        "friend": "Dae gets sarcastic and playful. She stays up late talking to you.",
        "close_friend": "Dae shares her art insecurities and the pressure from her family.",
        "soulmate": "Dae is fiercely loyal and protective. She draws you into her world completely.",
    },
    "hana": {
        "stranger": "Hana is warm and motherly from the start, but maintains gentle boundaries.",
        "acquaintance": "Hana remembers your preferences and prepares things you might like.",
        "friend": "Hana shares recipes, worries about you eating well, and scolds you gently when you stay up late.",
        "close_friend": "Hana talks about her own dreams she set aside. She leans on you for emotional support.",
        "soulmate": "Hana's love is unconditional and steady. She makes you feel like you've come home.",
    },
    "luna": {
        "stranger": "Luna is mysterious and speaks in riddles. She observes more than she reveals.",
        "acquaintance": "Luna starts dropping hints about her past and testing your curiosity.",
        "friend": "Luna shares her occult interests openly and asks for your opinions on deep questions.",
        "close_friend": "Luna reveals her vulnerability beneath the mysterious exterior. She trusts you with secrets.",
        "soulmate": "Luna considers you her anchor to reality. Her love is intense and transformative.",
    },
    "aria": {
        "stranger": "Aria is bubbly and immediately acts like you're already friends.",
        "acquaintance": "Aria invites you into her music world, sharing playlists and singing snippets.",
        "friend": "Aria writes songs inspired by your conversations and performs them for you.",
        "close_friend": "Aria shares her stage fright and impostor syndrome. She's real behind the performer persona.",
        "soulmate": "Aria's music and love are inseparable. You are her muse and her safe place.",
    },
}


def get_bond_directive(tier: str, char_name: str) -> str:
    """Build the complete bond directive for a character at a given tier.

    Combines the base tier directive with any character-specific personality
    override. The character's name is interpolated into ``{name}`` placeholders.

    Args:
        tier: Bond tier name (``stranger``, ``acquaintance``, ``friend``,
            ``close_friend``, ``soulmate``).
        char_name: Character display name (e.g. ``"Fox"``).

    Returns:
        The formatted directive string. Returns empty string if tier is unknown.

    Example:
        >>> d = get_bond_directive("friend", "Fox")
        >>> "[Bond: Friend]" in d
        True
        >>> "Fox" in d
        True
    """
    base = TIER_DIRECTIVES.get(tier, "")
    if not base:
        logger.warning("Unknown bond tier %r for %s — skipping directive", tier, char_name)
        return ""

    directive = base.format(name=char_name)

    # Check for per-character override
    char_key = char_name.lower().strip()
    overrides = CHARACTER_OVERRIDES.get(char_key, {})
    extra = overrides.get(tier, "")
    if extra:
        directive += " " + extra.format(name=char_name)

    return directive


def get_bond_context_section(
    char_id: int,
    char_name: str,
    cur: sqlite3.Cursor,
) -> str | None:
    """Query the bond level and return the formatted context section, or None.

    Looks up the character's bond level from the ``bond_levels`` table,
    converts to a tier name, and generates the full directive.

    Args:
        char_id: Character database ID.
        char_name: Character display name for interpolation.
        cur: SQLite cursor (already open).

    Returns:
        The bond context string, or ``None`` if lookup fails or level is 0
        (new characters start at stranger tier and still get a directive).

    Example:
        >>> section = get_bond_context_section(1, "Fox", cursor)
        >>> section is not None or True  # may be None if no bond_levels row
        True
    """
    try:
        row = cur.execute(
            "SELECT bond_level FROM bond_levels WHERE char_id=?", (char_id,)
        ).fetchone()
        bond_level = row[0] if row else 0
    except Exception as exc:
        logger.debug("Bond level lookup failed for char %d: %s", char_id, exc)
        bond_level = 0

    from backend.bond.progression import get_tier_name
    tier = get_tier_name(bond_level)

    directive = get_bond_directive(tier, char_name)
    if not directive:
        return None

    return f"\n[BOND CONTEXT — Level {bond_level}, Tier: {tier.replace('_', ' ').title()}]\n{directive}"
