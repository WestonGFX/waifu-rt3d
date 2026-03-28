"""Writing style presets for intimate scene generation.

Four distinct narrative approaches that change the LLM's output character.
Resolved in priority order: session override > character default > global default.

Style activation is gated on intimacy: :func:`build_style_prompt` returns an
empty string when ``intimacy_level < 30``, so no style overhead is injected
during casual conversation.

Example:
    >>> from backend.content.writing_styles import get_writing_style, build_style_prompt
    >>> import sqlite3
    >>> conn = sqlite3.connect(":memory:")
    >>> conn.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY, writing_style TEXT)")
    <sqlite3.Cursor object at ...>
    >>> preset = get_writing_style(session_id=1, char_id=1, conn=conn, char_name="Luna (Tsukimi)")
    >>> preset.name
    'romantic'
    >>> prompt = build_style_prompt(preset, intimacy_level=55)
    >>> "ROMANTIC" in prompt
    True
    >>> build_style_prompt(preset, intimacy_level=10)
    ''
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class WritingStylePreset:
    """A named writing style that shapes how the LLM narrates intimate scenes.

    Attributes:
        name: Machine-readable identifier (``"romantic"``, ``"literary"``,
            ``"direct"``, or ``"suggestive"``).
        display_name: Human-readable label for picker UI (e.g. ``"Romantic"``).
        description: One-sentence summary for the picker tooltip.
        sample_line: Example sentence that demonstrates the style's voice.
        prompt_template: Full LLM injection text appended to the system prompt
            when the style is active and intimacy is above the threshold.
    """

    name: str
    display_name: str
    description: str
    sample_line: str
    prompt_template: str


# ---------------------------------------------------------------------------
# Style prompt templates
# ---------------------------------------------------------------------------

#: Raw prompt templates keyed by style name.
#: Kept separate so the templates can be referenced or overridden independently
#: of the :class:`WritingStylePreset` dataclass hierarchy.
WRITING_STYLE_PROMPTS: dict[str, str] = {
    "romantic": """WRITING STYLE: ROMANTIC
Write intimate scenes with emotional depth and tenderness. Prioritize:
- What the characters FEEL over what they DO
- Emotional vulnerability and connection
- Gentle, warm physical descriptions
- Internal thoughts and reactions
- Metaphors drawn from the relationship's history
- Slower pacing — savor each moment

Vocabulary: tender, gentle, warm, breathless, trembling, aching, whisper, caress, melt
Avoid: clinical terms, crude language, mechanical descriptions
Sentence length: Mix of long flowing sentences and short emotional beats.
Example tone: "Every place their skin touched felt like a secret only they knew."
""",
    "literary": """WRITING STYLE: LITERARY
Write intimate scenes as artful prose. Prioritize:
- Rich sensory imagery and metaphor
- Symbolic resonance (weather, light, objects as emotional mirrors)
- Varied sentence rhythm (short punches between flowing paragraphs)
- Show, never tell — emotion through action and observation
- Subtext and implication alongside direct description
- Literary devices: anaphora, synesthesia, personification

Vocabulary: precise, evocative, layered. Each word earns its place.
Avoid: clichés, purple prose, repetitive sentence structures
Sentence length: Deliberately varied. Short fragments. Then long, rolling sentences that build like waves.
Example tone: "The storm outside had nothing on the one between them — all pressure and electricity and the sweet, inevitable surrender to gravity."
""",
    "direct": """WRITING STYLE: DIRECT
Write intimate scenes with unflinching clarity. Prioritize:
- Explicit, precise physical descriptions
- No euphemisms — call things what they are
- Strong action verbs and concrete nouns
- Character desire expressed openly, not hinted
- Present-tense urgency when appropriate
- Short paragraphs, punchy rhythm

Vocabulary: bold, explicit, unambiguous. Adult vocabulary used naturally, not for shock.
Avoid: purple prose, excessive metaphor, coyness, "throbbing" clichés
Sentence length: Short to medium. Direct. Active voice exclusively.
Example tone: "She pushed him back against the wall and kissed him like she'd been thinking about it all day. She had."
""",
    "suggestive": """WRITING STYLE: SUGGESTIVE
Write intimate scenes through implication and atmosphere. Prioritize:
- What's NOT said as much as what is
- Charged silences and meaningful looks
- Physical proximity and almost-touching
- Sensory details that suggest without describing
- Fade-to-black when appropriate, with emotionally rich lead-in
- Leave the reader's imagination room to work

Vocabulary: subtle, charged, atmospheric. More adjectives about air and space than bodies.
Avoid: explicit descriptions, graphic physical detail, crude language
Sentence length: Medium, measured. The rhythm of restraint.
Example tone: "She leaned close enough that he could feel her breath on his neck. The rest of the night wrote itself."
""",
}

# ---------------------------------------------------------------------------
# Per-character style defaults
# ---------------------------------------------------------------------------

#: Default writing style for each named character.
#: Keys are the canonical character display names used in the DB.
#: Falls back to ``"romantic"`` for any character not listed here.
CHARACTER_STYLE_DEFAULTS: dict[str, str] = {
    "Dae (Neciridae)": "literary",
    "Luna (Tsukimi)": "romantic",
    "Genki (Kitsune)": "direct",
    "Alana Calloway": "literary",
    "Sable (Kuroha)": "direct",
    "Tsundere (Raine)": "suggestive",
    "Ayane (Yuki)": "romantic",
    "Hana (Momoka)": "romantic",
    "Kaede (Suzuha)": "suggestive",
    "Mika (Mikazuki)": "direct",
    "Rin (Akane)": "direct",
    "Shiori (Nana)": "literary",
    "Yuki (Shirayuki)": "romantic",
}

# ---------------------------------------------------------------------------
# Preset registry
# ---------------------------------------------------------------------------

#: Complete registry of all four :class:`WritingStylePreset` objects, keyed by
#: style name.  Built once at module load from :data:`WRITING_STYLE_PROMPTS`.
STYLE_PRESETS: dict[str, WritingStylePreset] = {
    "romantic": WritingStylePreset(
        name="romantic",
        display_name="Romantic",
        description="Emotional depth and tenderness — feelings first, actions second.",
        sample_line="Every place their skin touched felt like a secret only they knew.",
        prompt_template=WRITING_STYLE_PROMPTS["romantic"],
    ),
    "literary": WritingStylePreset(
        name="literary",
        display_name="Literary",
        description="Artful prose with rich imagery, metaphor, and deliberate rhythm.",
        sample_line=(
            "The storm outside had nothing on the one between them — all pressure "
            "and electricity and the sweet, inevitable surrender to gravity."
        ),
        prompt_template=WRITING_STYLE_PROMPTS["literary"],
    ),
    "direct": WritingStylePreset(
        name="direct",
        display_name="Direct",
        description="Unflinching clarity — explicit, precise, no euphemisms.",
        sample_line=(
            "She pushed him back against the wall and kissed him like she'd been "
            "thinking about it all day. She had."
        ),
        prompt_template=WRITING_STYLE_PROMPTS["direct"],
    ),
    "suggestive": WritingStylePreset(
        name="suggestive",
        display_name="Suggestive",
        description="Charged atmosphere and implication — what's unsaid carries the weight.",
        sample_line=(
            "She leaned close enough that he could feel her breath on his neck. "
            "The rest of the night wrote itself."
        ),
        prompt_template=WRITING_STYLE_PROMPTS["suggestive"],
    ),
}

# Threshold below which no style injection occurs.
_INTIMACY_THRESHOLD: int = 30

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_writing_style(
    session_id: int,
    char_id: int,
    conn: sqlite3.Connection,
    *,
    char_name: str = "",
) -> WritingStylePreset:
    """Resolve the active writing style for the current session and character.

    Resolution priority (highest wins):

    1. **Session override** — ``sessions.writing_style`` column for
       *session_id*, if the column exists and the row has a non-NULL value
       that matches a known preset.
    2. **Character default** — :data:`CHARACTER_STYLE_DEFAULTS` lookup by
       *char_name*, if *char_name* is provided and present in the mapping.
    3. **Global default** — ``"romantic"``.

    The function never raises on a missing ``writing_style`` column or a
    missing session row; it logs a debug message and falls through to the
    next priority level.

    Args:
        session_id: Primary key of the current chat session.
        char_id: Primary key of the active character (currently unused but
            reserved for future per-character DB overrides).
        conn: Open ``sqlite3.Connection``; a cursor is created internally so
            the caller retains transaction control.
        char_name: Display name of the active character, used to look up
            :data:`CHARACTER_STYLE_DEFAULTS`.  Pass an empty string (default)
            to skip the character-default tier.

    Returns:
        The resolved :class:`WritingStylePreset`.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> _ = conn.execute(
        ...     "CREATE TABLE sessions (id INTEGER PRIMARY KEY, writing_style TEXT)"
        ... )
        >>> _ = conn.execute("INSERT INTO sessions VALUES (1, 'literary')")
        >>> preset = get_writing_style(1, 0, conn, char_name="Luna (Tsukimi)")
        >>> preset.name   # session override wins
        'literary'
    """
    # --- Tier 1: session override ---
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT writing_style FROM sessions WHERE id = ?",
            (session_id,),
        )
        row = cur.fetchone()
        if row is not None:
            style_name: str | None = row[0]
            if style_name and style_name in STYLE_PRESETS:
                logger.debug(
                    "get_writing_style: session %d override → %r",
                    session_id,
                    style_name,
                )
                return STYLE_PRESETS[style_name]
    except sqlite3.OperationalError as exc:
        # Column may not exist in older schema versions — fall through silently.
        logger.debug(
            "get_writing_style: could not read sessions.writing_style for "
            "session_id=%d: %s",
            session_id,
            exc,
        )

    # --- Tier 2: character default ---
    if char_name and char_name in CHARACTER_STYLE_DEFAULTS:
        char_style = CHARACTER_STYLE_DEFAULTS[char_name]
        logger.debug(
            "get_writing_style: char_name=%r → character default %r",
            char_name,
            char_style,
        )
        return STYLE_PRESETS[char_style]

    # --- Tier 3: global default ---
    logger.debug("get_writing_style: falling back to global default 'romantic'")
    return STYLE_PRESETS["romantic"]


def build_style_prompt(
    preset: WritingStylePreset,
    intimacy_level: int = 0,
) -> str:
    """Return the LLM injection block for *preset*, gated on *intimacy_level*.

    Writing style instructions are only injected when the relationship has
    progressed beyond casual — specifically when ``intimacy_level >= 30``.
    Below that threshold the function returns an empty string so that no
    style overhead pollutes everyday conversation.

    Args:
        preset: The resolved :class:`WritingStylePreset` to inject.
        intimacy_level: Current intimacy score in ``[0, 100]``.  Values
            outside this range are accepted without error.

    Returns:
        The preset's ``prompt_template`` string when
        ``intimacy_level >= 30``, otherwise ``""``.

    Example:
        >>> from backend.content.writing_styles import STYLE_PRESETS, build_style_prompt
        >>> p = STYLE_PRESETS["direct"]
        >>> build_style_prompt(p, intimacy_level=29)
        ''
        >>> "DIRECT" in build_style_prompt(p, intimacy_level=30)
        True
    """
    if intimacy_level < _INTIMACY_THRESHOLD:
        return ""
    return preset.prompt_template


def list_presets() -> list[WritingStylePreset]:
    """Return all four writing style presets in a stable display order.

    Order: romantic → literary → direct → suggestive.

    Returns:
        List of all four :class:`WritingStylePreset` objects, suitable for
        populating a style-picker UI.

    Example:
        >>> from backend.content.writing_styles import list_presets
        >>> names = [p.name for p in list_presets()]
        >>> names
        ['romantic', 'literary', 'direct', 'suggestive']
    """
    return [
        STYLE_PRESETS["romantic"],
        STYLE_PRESETS["literary"],
        STYLE_PRESETS["direct"],
        STYLE_PRESETS["suggestive"],
    ]
