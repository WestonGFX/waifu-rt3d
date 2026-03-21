"""Granular per-level LLM prompt directive builders.

Each function returns a ready-to-inject multiline string (or an empty string
when the block is not applicable for the current state).  The caller simply
checks truthiness before prepending the block to the system message:

    block = build_content_directive_block("mature", intimacy_level=55)
    if block:
        system_parts.insert(0, block)

Ported from AnimeGirly's TypeScript prompt-builder module.

Example:
    >>> from backend.content.prompts import build_content_directive_block
    >>> block = build_content_directive_block("edgy")
    >>> block.startswith("[Content Rating: Edgy")
    True
    >>> build_content_directive_block("general", intimacy_level=0)  # no intimacy line
    '[Content Rating: General — Family-friendly mode]\\nKeep all content appropriate for all ages. No sexual content, innuendo, or suggestive themes.\\nRomance should be expressed through emotional warmth, kind words, and wholesome affection only.\\nAvoid any descriptions of physical intimacy beyond friendly hugs or hand-holding.'
"""

from __future__ import annotations

from backend.content.types import (
    CONTENT_RATING_ORDER,
    ContentRatingLevel,
    PhysicalState,
    SensoryWritingConfig,
    DEFAULT_PHYSICAL_STATE,
)

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

_DEFAULT = DEFAULT_PHYSICAL_STATE
"""Fallback default PhysicalState used for equality checks."""

_LEVEL_IDX: dict[str, int] = {lvl: i for i, lvl in enumerate(CONTENT_RATING_ORDER)}
"""Pre-computed index map so comparisons avoid repeated list.index() calls."""


def _below(level: ContentRatingLevel, threshold: ContentRatingLevel) -> bool:
    """Return True if *level* is strictly less restrictive than *threshold*.

    Args:
        level: The level to test.
        threshold: The reference level.

    Returns:
        True when level's index in the canonical ordering is less than
        threshold's index.

    Example:
        >>> _below("general", "explicit")
        True
        >>> _below("explicit", "explicit")
        False
    """
    return _LEVEL_IDX[level] < _LEVEL_IDX[threshold]


# ---------------------------------------------------------------------------
# Public builders
# ---------------------------------------------------------------------------


def build_content_directive_block(
    ceiling: ContentRatingLevel,
    intimacy_level: int = 0,
) -> str:
    """Build the system-prompt block that sets the content-rating directive.

    The block is always returned (it is never empty) because every
    conversation needs a content framing directive.  An optional intimacy
    line is appended when ``intimacy_level > 0`` to inform the model of the
    current relational temperature.

    Args:
        ceiling: The effective content-rating ceiling for this turn, as
            returned by ``resolve_effective_ceiling``.
        intimacy_level: Current intimacy score on a 0–100 scale.  Values
            of zero produce no intimacy-line suffix.  Defaults to ``0``.

    Returns:
        A multiline string suitable for injection as the opening block of
        the system message.

    Example:
        >>> block = build_content_directive_block("general")
        >>> block.startswith("[Content Rating: General")
        True
        >>> "intimacy" not in block
        True
        >>> block2 = build_content_directive_block("edgy", intimacy_level=42)
        >>> "42/100" in block2
        True
    """
    level_blocks: dict[str, str] = {
        "general": (
            "[Content Rating: General — Family-friendly mode]\n"
            "Keep all content appropriate for all ages."
            " No sexual content, innuendo, or suggestive themes.\n"
            "Romance should be expressed through emotional warmth,"
            " kind words, and wholesome affection only.\n"
            "Avoid any descriptions of physical intimacy beyond"
            " friendly hugs or hand-holding."
        ),
        "edgy": (
            "[Content Rating: Edgy — Moderate romantic content permitted]\n"
            "Light flirting, teasing, and romantic tension are welcome.\n"
            "Physical affection up to hand-holding, cuddling, and light"
            " kissing is appropriate.\n"
            "Avoid explicit sexual content or graphic physical descriptions.\n"
            "Suggestive humor and innuendo are acceptable when natural"
            " to the conversation."
        ),
        "mature": (
            "[Content Rating: Mature — Romantic and sensual content permitted]\n"
            "Passionate physical interactions and sensual descriptions are permitted.\n"
            "You may describe intimate moments with emotional depth and tasteful detail.\n"
            "Avoid graphic or explicit sexual descriptions — imply rather than describe.\n"
            "Focus on emotional connection, tension, and the sensory experience."
        ),
        "explicit": (
            "[Content Rating: Explicit — Fully explicit content permitted]\n"
            "All forms of consensual intimate content are permitted.\n"
            "Prioritize emotional authenticity and connection in intimate scenes.\n"
            "Write with literary quality — avoid crude or gratuitous descriptions.\n"
            "Physical descriptions should serve the emotional narrative."
        ),
    }

    block = level_blocks[ceiling]

    if intimacy_level > 0:
        block += (
            f"\nCurrent emotional closeness: {intimacy_level}/100."
            " Let this naturally inform the warmth and openness of your responses."
        )

    return block


def build_physical_awareness_block(physical_state: PhysicalState) -> str:
    """Build the system-prompt block describing the current physical scene context.

    Returns an empty string when *physical_state* is at its default values,
    so callers can safely gate on truthiness.

    The block reminds the model of the shared spatial context and clothing
    without ever being referenced explicitly in dialogue — the header
    comment instructs the model to use the information implicitly.

    Args:
        physical_state: The current physical/spatial snapshot for this
            conversation.  Compared field-by-field against the module-level
            ``_DEFAULT`` sentinel to detect non-default state.

    Returns:
        A multiline context block, or ``""`` when the state is still at
        default values.

    Example:
        >>> from backend.content.types import PhysicalState
        >>> build_physical_awareness_block(PhysicalState())
        ''
        >>> ps = PhysicalState(companion_clothing="yukata",
        ...                    physical_context="lying side by side")
        >>> block = build_physical_awareness_block(ps)
        >>> "yukata" in block
        True
        >>> "Recent physical actions" in block  # no recent_actions on ps
        False
    """
    # Detect whether anything has deviated from the zero state.
    is_default = (
        physical_state.user_clothing == _DEFAULT.user_clothing
        and physical_state.companion_clothing == _DEFAULT.companion_clothing
        and physical_state.physical_context == _DEFAULT.physical_context
        and not physical_state.recent_actions
    )
    if is_default:
        return ""

    lines = [
        "[Physical Scene Context — maintain consistency,"
        " never reference this block directly]",
        f"Setting: {physical_state.physical_context}",
        f"Your clothing: {physical_state.companion_clothing}",
        f"Their clothing: {physical_state.user_clothing}",
    ]

    if physical_state.recent_actions:
        actions_str = "; ".join(physical_state.recent_actions)
        lines.append(f"Recent physical actions: {actions_str}")

    return "\n".join(lines)


def build_sensory_writing_block(
    config: SensoryWritingConfig,
    intimacy_level: int = 0,
) -> str:
    """Build the system-prompt block that enables multi-sensory writing directives.

    Returns an empty string when sensory writing is disabled or when no
    individual sense channels are active, so callers can gate on truthiness.

    The effective intensity is boosted by one point for every 20 intimacy
    levels above zero (capped at 10), reflecting that heightened emotional
    proximity naturally intensifies sensory perception.

    Args:
        config: Sensory writing configuration from user preferences,
            including the master ``enabled`` flag, per-channel emphasis
            flags, and baseline intensity.
        intimacy_level: Current intimacy score (0–100).  Each 20 points
            adds 1 to the effective intensity, up to a max of 10.
            Defaults to ``0``.

    Returns:
        A multiline directive block, or ``""`` when the block should not
        be injected.

    Example:
        >>> from backend.content.types import SensoryWritingConfig
        >>> build_sensory_writing_block(SensoryWritingConfig(enabled=False))
        ''
        >>> cfg = SensoryWritingConfig(enabled=True, intensity=5,
        ...     emphasis_sound=True, emphasis_touch=True,
        ...     emphasis_scent=False, emphasis_temperature=False,
        ...     emphasis_texture=False, emphasis_taste=False)
        >>> block = build_sensory_writing_block(cfg, intimacy_level=0)
        >>> "sound" in block and "touch" in block
        True
        >>> "scent" not in block
        True
    """
    if not config.enabled:
        return ""

    # Collect active channel names in a fixed canonical order.
    channel_map: list[tuple[bool, str]] = [
        (config.emphasis_sound, "sound"),
        (config.emphasis_scent, "scent"),
        (config.emphasis_touch, "touch"),
        (config.emphasis_temperature, "temperature"),
        (config.emphasis_texture, "texture"),
        (config.emphasis_taste, "taste"),
    ]
    active_channels = [name for active, name in channel_map if active]

    if not active_channels:
        return ""

    effective_intensity = min(10, config.intensity + intimacy_level // 20)
    channel_list = ", ".join(active_channels)

    return (
        f"[Sensory Writing Emphasis — intensity {effective_intensity}/10]\n"
        f"Enrich your descriptions with vivid {channel_list} details.\n"
        "Use sensory language naturally — don't force it,"
        " but weave it into your responses."
    )


def build_intimacy_gate_block(
    intimacy_level: int,
    ceiling: ContentRatingLevel,
) -> str:
    """Build the system-prompt block that guides intimacy-appropriate behaviour.

    Returns an empty string for ``ceiling == "general"`` combined with
    ``intimacy_level < 10``, so callers can gate on truthiness.

    The block is graduated across four bands that map directly to the
    ``IntimacyThresholds`` values defined in ``types.py``:

    * **0–29** — Early Connection (light flirting, friendly gestures only)
    * **30–59** — Growing Closeness (open flirting, light physical affection)
    * **60–84** — Deep Connection (passionate kissing, sensual detail)
    * **85–100** — Full/Deep Intimacy (content-ceiling-aware)

    At the 85–100 band the block text diverges: when the ceiling is
    ``"explicit"`` full intimacy guidance is given; for any lower ceiling
    the model is directed to imply rather than describe.

    Args:
        intimacy_level: Current intimacy score on a 0–100 scale.
        ceiling: The effective content ceiling for this turn.

    Returns:
        A multiline guidance block, or ``""`` when the block should not
        be injected.

    Example:
        >>> build_intimacy_gate_block(0, "general")
        ''
        >>> block = build_intimacy_gate_block(15, "edgy")
        >>> "Early Connection" in block
        True
        >>> block2 = build_intimacy_gate_block(90, "explicit")
        >>> "Full Intimacy" in block2
        True
        >>> block3 = build_intimacy_gate_block(90, "mature")
        >>> "Deep Intimacy" in block3
        True
    """
    # Early-exit: general ceiling + low intimacy → no guidance needed.
    if ceiling == "general" and intimacy_level < 10:
        return ""

    if intimacy_level < 30:
        return (
            "[Intimacy Guide — Early Connection]\n"
            "You may: engage in light flirting, playful teasing, warm compliments.\n"
            "You should not yet: initiate physical contact beyond friendly gestures.\n"
            "Let affection build naturally through conversation and shared moments."
        )

    if intimacy_level < 60:
        return (
            "[Intimacy Guide — Growing Closeness]\n"
            "You may: flirt openly, hold hands, lean close,"
            " light touching, casual physical affection.\n"
            "You should not yet: initiate passionate kissing"
            " or intimate physical contact.\n"
            "Show growing comfort through body language and emotional openness."
        )

    if intimacy_level < 85:
        return (
            "[Intimacy Guide — Deep Connection]\n"
            "You may: passionate kissing, intimate touching,"
            " sensual detail, emotional vulnerability.\n"
            "You should not yet: initiate explicit sexual acts.\n"
            "Express desire through tension, anticipation, and emotional depth."
        )

    # intimacy_level >= 85
    if ceiling == "explicit":
        return (
            "[Intimacy Guide — Full Intimacy]\n"
            "Full consensual intimacy is natural at this level of connection.\n"
            "Prioritize emotional authenticity — physical expressions"
            " should reflect genuine feeling.\n"
            "Write intimate scenes with literary quality and emotional depth."
        )

    # ceiling is mature/edgy/general with high intimacy
    return (
        "[Intimacy Guide — Deep Intimacy]\n"
        "Your connection runs deep — express this through intense"
        " emotional and physical closeness.\n"
        "Imply rather than describe explicit acts."
        " Focus on sensation, emotion, and connection."
    )
