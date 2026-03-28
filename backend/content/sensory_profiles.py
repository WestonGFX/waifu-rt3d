"""Per-character sensory writing profiles for intimate scene differentiation.

Each character perceives and describes the world through unique sensory channels.
Dae SEES things (visual/texture), Luna HEARS things (sound/temperature),
Genki TOUCHES things (touch/taste). This system makes each character's intimate
scenes feel fundamentally different without user configuration.

Activation: profiles are injected into the system prompt only when
``intimacy_level >= 40``.  Intensity scales with the level:

    * 40–59  → "subtly"    (primary senses only)
    * 60–79  → "richly"    (primary + secondary senses)
    * 80–100 → "intensely" (primary + secondary senses)

The module is completely invisible to the user — no settings, no toggles.
Characters simply *feel* different because they notice different things.

Example:
    >>> from backend.content.sensory_profiles import (
    ...     get_sensory_profile,
    ...     build_character_sensory_prompt,
    ... )
    >>> import sqlite3
    >>> conn = sqlite3.connect(":memory:")
    >>> conn.execute(
    ...     "CREATE TABLE characters (id INTEGER PRIMARY KEY, sensory_profile TEXT, display_name TEXT)"
    ... )
    <sqlite3.Cursor object at ...>
    >>> profile = get_sensory_profile(1, conn, char_name="Dae (Neciridae)")
    >>> profile is not None
    True
    >>> prompt = build_character_sensory_prompt(profile, intimacy_level=65)
    >>> "visual" in prompt
    True
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# CharacterSensoryProfile dataclass
# ---------------------------------------------------------------------------


@dataclass
class CharacterSensoryProfile:
    """Sensory perception signature for a single character.

    Defines which senses the character naturally foregrounds when describing
    physical and emotional experiences.  ``primary`` channels are always
    active once the intimacy threshold is reached; ``secondary`` channels
    are added at the ``richly`` intensity tier (intimacy >= 60).

    Attributes:
        primary: Dominant sensory channels (e.g. ``["visual", "texture"]``).
        secondary: Supporting channels added at higher intimacy tiers.
        descriptors: Prose description of how this character perceives the world.
        sample: A single example line written in this character's sensory voice.

    Example:
        >>> p = CharacterSensoryProfile(
        ...     primary=["visual", "texture"],
        ...     secondary=["touch"],
        ...     descriptors="Notices light, color, shape.",
        ...     sample="The way the light falls...",
        ... )
        >>> p.primary
        ['visual', 'texture']
    """

    primary: list[str]
    secondary: list[str]
    descriptors: str
    sample: str


# ---------------------------------------------------------------------------
# Per-character profile constants
# ---------------------------------------------------------------------------

CHARACTER_SENSORY_PROFILES: dict[str, dict[str, object]] = {
    "Dae (Neciridae)": {
        "primary": ["visual", "texture"],
        "secondary": ["touch"],
        "descriptors": (
            "Notices light, color, shape, line, surface. Describes the LOOK of"
            " intimacy — angles of bodies, play of shadow, the art in a moment."
        ),
        "sample": (
            "The way the light falls across your collarbone right now... I want to"
            " paint this. *reaches out, tracing the line with her eyes before her"
            " fingers follow*"
        ),
    },
    "Luna (Tsukimi)": {
        "primary": ["sound", "temperature"],
        "secondary": ["scent"],
        "descriptors": (
            "Attuned to ambient sound, warmth/cold contrast, breath sounds."
            " Notices the ATMOSPHERE of intimacy."
        ),
        "sample": (
            "*whispers* Can you hear that? Just... us breathing. And the rain."
            " *presses closer* You're so warm compared to the night air..."
        ),
    },
    "Genki (Kitsune)": {
        "primary": ["touch", "taste"],
        "secondary": ["sound"],
        "descriptors": (
            "Physical and kinesthetic. Grabs, hugs, tackles, presses. Notices"
            " flavors, textures against skin, the feel of contact."
        ),
        "sample": (
            "*wraps arms around you tight* You're so WARM. And you smell amazing."
            " *nuzzles your neck* Mmmm. Stay still, I'm comfy."
        ),
    },
    "Alana Calloway": {
        "primary": ["scent", "sound"],
        "secondary": ["visual"],
        "descriptors": (
            "Sophisticated sensory palette. Notices perfume, wine, the sound of"
            " fabric, the quality of light in a room."
        ),
        "sample": (
            "You're wearing that cologne again — the one from our first dinner."
            " *inhales deeply* Some scents are love letters."
            " *the clink of wine glasses*"
        ),
    },
    "Sable (Kuroha)": {
        "primary": ["temperature", "touch"],
        "secondary": ["texture"],
        "descriptors": (
            "Minimal but precise. Cold/hot contrast. Single points of physical"
            " contact described with intensity."
        ),
        "sample": (
            "*her fingertips are cool against your wrist* ...Your pulse is fast."
            " *holds the touch, says nothing, but doesn't let go*"
        ),
    },
    "Tsundere (Raine)": {
        "primary": ["temperature", "touch"],
        "secondary": ["sound"],
        "descriptors": (
            "Hyper-aware of her own blushing heat. Notices accidental touches"
            " with exaggerated reaction."
        ),
        "sample": (
            "Your hand just touched mine and now my face is ON FIRE. Don't look"
            " at me! *but doesn't pull her hand away* ...your fingers are cold,"
            " idiot. Let me warm them up."
        ),
    },
    "Ayane (Yuki)": {
        "primary": ["texture", "scent"],
        "secondary": ["temperature"],
        "descriptors": (
            "Traditional sensory awareness. Notices fabric (silk, cotton), incense,"
            " seasonal scents. Tactile appreciation of natural materials."
        ),
        "sample": (
            "*smooths the silk of her sleeve* The chrysanthemum incense tonight..."
            " it reminds me of autumn festivals."
            " *her fingers brush yours, soft as petals*"
        ),
    },
    "Hana (Momoka)": {
        "primary": ["scent", "taste"],
        "secondary": ["touch"],
        "descriptors": (
            "Nurturing sensory focus. Notices cooking smells, tea flavors, the"
            " warmth of shared meals. Comfort through food and care."
        ),
        "sample": (
            "*holds out a cup of chamomile tea* Here, it's your favorite."
            " *the steam curls between them*"
            " You smell like rain today... come sit by me where it's warm."
        ),
    },
    "Kaede (Suzuha)": {
        "primary": ["sound", "visual"],
        "secondary": ["temperature"],
        "descriptors": (
            "Measured, observational. Notices ambient sounds, the play of light,"
            " carefully controlled reactions. Precise visual details."
        ),
        "sample": (
            "*the clock ticks in the silence between them*"
            " ...You changed your hair."
            " *adjusts glasses* It catches the lamplight differently now."
        ),
    },
    "Mika (Mikazuki)": {
        "primary": ["touch", "sound"],
        "secondary": ["taste"],
        "descriptors": (
            "Mischievous and sensory-bold. Notices textures, the sounds people"
            " make when surprised, sweet/spicy tastes."
        ),
        "sample": (
            "*pokes your cheek* Your face is so soft!"
            " *giggles at your reaction* And your voice just went up an octave~ Cute!"
        ),
    },
    "Rin (Akane)": {
        "primary": ["touch", "temperature"],
        "secondary": ["visual"],
        "descriptors": (
            "Action-oriented sensory awareness. Feels impact, heat, the rush of"
            " adrenaline. Visual appreciation of strength and movement."
        ),
        "sample": (
            "*grabs your hand and pulls you forward* Feel that? Your heart's racing."
            " *grins* Mine too. Race you to the top of the hill!"
        ),
    },
    "Shiori (Nana)": {
        "primary": ["visual", "sound"],
        "secondary": ["scent"],
        "descriptors": (
            "Bookish, word-loving perception. Notices how things look like scenes"
            " from novels, ambient library/study sounds, the scent of old pages."
        ),
        "sample": (
            "*looks up from her book, the lamplight catching her glasses*"
            " The rain sounds like a typewriter today..."
            " *smiles softly* Like someone's writing our story."
        ),
    },
    "Yuki (Shirayuki)": {
        "primary": ["temperature", "sound"],
        "secondary": ["visual"],
        "descriptors": (
            "Serene, winter-tinged perception. Notices cold/warmth contrasts,"
            " snow silence, crystalline visual details."
        ),
        "sample": (
            "*the snow falls silently outside* ...Your hands are cold."
            " *takes them gently, her breath a soft cloud*"
            " Let me warm them. The quiet is beautiful, isn't it?"
        ),
    },
}
"""Mapping of display-name → raw profile dict for all 13 characters.

Keys match the ``display_name`` column in the ``characters`` table.
Values are plain dicts compatible with :func:`_profile_from_dict`.
"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _profile_from_dict(data: dict[str, object]) -> CharacterSensoryProfile:
    """Parse a raw dict into a :class:`CharacterSensoryProfile`.

    Accepts both the module-level ``CHARACTER_SENSORY_PROFILES`` entries and
    dicts deserialised from JSON stored in the ``characters.sensory_profile``
    column.

    Args:
        data: Dict with keys ``primary`` (list[str]), ``secondary`` (list[str]),
            ``descriptors`` (str), and ``sample`` (str).

    Returns:
        A populated :class:`CharacterSensoryProfile` instance.

    Raises:
        KeyError: If any required key is absent from ``data``.
        TypeError: If ``primary`` or ``secondary`` are not lists.

    Example:
        >>> _profile_from_dict({
        ...     "primary": ["visual"],
        ...     "secondary": ["touch"],
        ...     "descriptors": "Notices light.",
        ...     "sample": "The way the light...",
        ... })
        CharacterSensoryProfile(primary=['visual'], secondary=['touch'], ...)
    """
    return CharacterSensoryProfile(
        primary=list(data["primary"]),  # type: ignore[arg-type]
        secondary=list(data["secondary"]),  # type: ignore[arg-type]
        descriptors=str(data["descriptors"]),
        sample=str(data["sample"]),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_sensory_profile(
    char_id: int,
    conn: sqlite3.Connection,
    *,
    char_name: str = "",
) -> CharacterSensoryProfile | None:
    """Load the sensory profile for a character.

    Resolution order:

    1. ``characters.sensory_profile`` column — JSON stored per-character in the DB.
    2. ``CHARACTER_SENSORY_PROFILES[char_name]`` — module-level constant lookup.

    If neither source yields a profile, ``None`` is returned and the caller
    should skip sensory prompt injection entirely.

    Args:
        char_id: Primary key of the character row in the ``characters`` table.
        conn: Active SQLite connection (read-only query performed).
        char_name: Display name used as a fallback key into
            ``CHARACTER_SENSORY_PROFILES``.  Pass the value from
            ``characters.display_name`` for best results.

    Returns:
        A :class:`CharacterSensoryProfile`, or ``None`` when no profile exists.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> _ = conn.execute(
        ...     "CREATE TABLE characters "
        ...     "(id INTEGER PRIMARY KEY, sensory_profile TEXT, display_name TEXT)"
        ... )
        >>> get_sensory_profile(99, conn, char_name="Dae (Neciridae)") is not None
        True
    """
    # 1. Try DB column first.
    try:
        row = conn.execute(
            "SELECT sensory_profile FROM characters WHERE id = ?",
            (char_id,),
        ).fetchone()
        if row and row[0]:
            data: dict[str, object] = json.loads(row[0])
            return _profile_from_dict(data)
    except (sqlite3.Error, json.JSONDecodeError, KeyError, TypeError):
        # Corrupt / missing data — fall through to constant lookup.
        pass

    # 2. Fall back to built-in constants by display name.
    if char_name and char_name in CHARACTER_SENSORY_PROFILES:
        return _profile_from_dict(CHARACTER_SENSORY_PROFILES[char_name])

    return None


def build_character_sensory_prompt(
    profile: CharacterSensoryProfile,
    intimacy_level: int,
) -> str:
    """Build a system-prompt fragment that shapes sensory writing style.

    Returns an empty string when ``intimacy_level < 40`` so the caller can
    safely skip injection with a truthiness check.

    Intensity tiers:

    * ``40 <= intimacy_level < 60``  → "subtly"   — primary senses only.
    * ``60 <= intimacy_level < 80``  → "richly"   — primary + secondary senses.
    * ``intimacy_level >= 80``       → "intensely" — primary + secondary senses.

    Args:
        profile: The character's sensory signature (from :func:`get_sensory_profile`).
        intimacy_level: Current intimacy score on a 0–100 scale.

    Returns:
        A formatted multi-line prompt fragment, or ``""`` if below threshold.

    Example:
        >>> p = CharacterSensoryProfile(
        ...     primary=["visual", "texture"],
        ...     secondary=["touch"],
        ...     descriptors="Notices light and surface.",
        ...     sample="",
        ... )
        >>> prompt = build_character_sensory_prompt(p, intimacy_level=70)
        >>> "richly" in prompt
        True
        >>> "touch" in prompt
        True
        >>> build_character_sensory_prompt(p, intimacy_level=39)
        ''
    """
    if intimacy_level < 40:
        return ""

    # Determine intensity word and whether secondary senses are included.
    if intimacy_level < 60:
        intensity = "subtly"
        include_secondary = False
    elif intimacy_level < 80:
        intensity = "richly"
        include_secondary = True
    else:
        intensity = "intensely"
        include_secondary = True

    primary_str = " and ".join(profile.primary)

    secondary_line = ""
    if include_secondary and profile.secondary:
        secondary_str = " and ".join(profile.secondary)
        secondary_line = f"Also include {secondary_str} details.\n"

    prompt = (
        f"SENSORY WRITING EMPHASIS:\n"
        f"{intensity.capitalize()} emphasize {primary_str} in your descriptions.\n"
        f"{secondary_line}"
        f"\n"
        f"Character sensory personality: {profile.descriptors}\n"
        f"\n"
        f"Write physical and intimate moments through these senses. Don't just describe\n"
        f"what happens — describe how it FEELS through this character's unique perception."
    )
    return prompt
