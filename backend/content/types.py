"""Content gating types — dataclasses and constants for the rating/intimacy system.

Ported from AnimeGirly's TypeScript content-gating types to Python dataclasses.
These types are shared by the gating, intimacy, and prompt-builder modules and
must not import from the rest of the backend to avoid circular dependencies.

Hierarchy (least → most restricted):
    general → edgy → mature → explicit

Example:
    >>> from backend.content.types import IntimacyState, intimacy_band
    >>> state = IntimacyState(level=45)
    >>> intimacy_band(state.level)
    'edgy'
    >>> from backend.content.types import ContentGateConfig
    >>> cfg = ContentGateConfig(global_content_ceiling="mature", age_verified=True)
    >>> cfg.global_content_ceiling
    'mature'
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal


# ---------------------------------------------------------------------------
# ContentRatingLevel — ordered string literals
# ---------------------------------------------------------------------------

ContentRatingLevel = Literal["general", "edgy", "mature", "explicit"]
"""Union of the four valid content-rating strings.

Values progress from safest (``"general"``) to least restricted
(``"explicit"``). Use ``CONTENT_RATING_ORDER`` for index-based comparisons.
"""

CONTENT_RATING_ORDER: list[str] = ["general", "edgy", "mature", "explicit"]
"""Ordered list of content rating levels, index 0 = safest.

Use ``CONTENT_RATING_ORDER.index(a) < CONTENT_RATING_ORDER.index(b)`` to
compare two levels without string gymnastics.

Example:
    >>> CONTENT_RATING_ORDER.index("edgy") < CONTENT_RATING_ORDER.index("explicit")
    True
"""


# ---------------------------------------------------------------------------
# IntimacyState
# ---------------------------------------------------------------------------


@dataclass
class IntimacyState:
    """Current intimacy score and trend for a single conversation session.

    The ``level`` field drives which content actions are permitted under a
    given ``ContentGateConfig.global_content_ceiling``.  It is adjusted
    turn-by-turn by the intimacy scorer and never persisted directly — it
    is reconstructed from the conversation on session resume.

    Attributes:
        level: Intimacy score on a 0–100 scale (0 = neutral, 100 = maximum).
        trend: Direction of the most recent adjustment.
        last_update_turn: Conversation turn index when ``level`` was last changed.

    Example:
        >>> state = IntimacyState(level=55, trend="rising", last_update_turn=12)
        >>> state.level
        55
        >>> state.trend
        'rising'
    """

    level: int = 0
    trend: Literal["rising", "stable", "cooling"] = "stable"
    last_update_turn: int = 0


# ---------------------------------------------------------------------------
# IntimacyThresholds
# ---------------------------------------------------------------------------


@dataclass
class IntimacyThresholds:
    """Score-range bands that map an intimacy level to a behavioural tier.

    Each field is an inclusive-start, exclusive-end tuple ``(low, high)``.
    The bands are contiguous and cover the full 0–100 range.

    Attributes:
        flirty: Lightest romantic tier (0–30).
        suggestive: Moderate romantic/sensual tier (30–60).
        heavy_physical: Strong physical/sensual tier (60–85).
        explicit: Fully explicit tier (85–100).

    Example:
        >>> from backend.content.types import DEFAULT_INTIMACY_THRESHOLDS
        >>> DEFAULT_INTIMACY_THRESHOLDS.flirty
        (0, 30)
        >>> DEFAULT_INTIMACY_THRESHOLDS.explicit
        (85, 100)
    """

    flirty: tuple[int, int] = (0, 30)
    suggestive: tuple[int, int] = (30, 60)
    heavy_physical: tuple[int, int] = (60, 85)
    explicit: tuple[int, int] = (85, 100)


DEFAULT_INTIMACY_THRESHOLDS: IntimacyThresholds = IntimacyThresholds()
"""Singleton default thresholds used when no per-character override is set."""


def intimacy_band(level: int) -> ContentRatingLevel:
    """Map a 0–100 intimacy score to a ``ContentRatingLevel`` band.

    Uses ``DEFAULT_INTIMACY_THRESHOLDS`` for band boundaries.  The upper
    boundary of each band is exclusive; a score of exactly 30 falls into
    ``"edgy"`` (the ``suggestive`` band), not ``"general"``.

    Args:
        level: Intimacy score in the range 0–100 (values outside this
            range are clamped to the nearest boundary).

    Returns:
        The matching ``ContentRatingLevel`` string.

    Example:
        >>> intimacy_band(0)
        'general'
        >>> intimacy_band(29)
        'general'
        >>> intimacy_band(30)
        'edgy'
        >>> intimacy_band(60)
        'mature'
        >>> intimacy_band(85)
        'explicit'
        >>> intimacy_band(100)
        'explicit'
    """
    t = DEFAULT_INTIMACY_THRESHOLDS
    clamped = max(0, min(100, level))
    if clamped < t.suggestive[0]:  # < 30
        return "general"
    if clamped < t.heavy_physical[0]:  # < 60
        return "edgy"
    if clamped < t.explicit[0]:  # < 85
        return "mature"
    return "explicit"


# ---------------------------------------------------------------------------
# PhysicalState
# ---------------------------------------------------------------------------


@dataclass
class PhysicalState:
    """Snapshot of the physical/spatial context between user and companion.

    Updated by the intimacy module as the conversation progresses.
    ``arousal_level`` is only tracked (and injected into prompts) when the
    active content ceiling is ``"mature"`` or higher.

    ``recent_actions`` is a rolling window capped at 5 entries; older
    actions are dropped to keep prompt context concise.

    Attributes:
        user_clothing: Description of what the user is currently wearing.
        companion_clothing: Description of the companion's current outfit.
        physical_context: Spatial/situational description of their
            shared environment (e.g. ``"sitting side by side on a sofa"``).
        arousal_level: Physical arousal on a 0–10 scale; only meaningful
            at ``"mature"`` ceiling or above.
        recent_actions: Last ≤5 physical interaction descriptions, most
            recent last.
        last_updated_at: Unix timestamp of the most recent mutation.

    Example:
        >>> from backend.content.types import PhysicalState
        >>> ps = PhysicalState(companion_clothing="yukata", arousal_level=3)
        >>> ps.user_clothing
        'casual clothes'
        >>> ps.arousal_level
        3
    """

    user_clothing: str = "casual clothes"
    companion_clothing: str = "default outfit"
    physical_context: str = "sitting across from each other"
    arousal_level: int = 0
    recent_actions: list[str] = field(default_factory=list)
    last_updated_at: float = 0.0


DEFAULT_PHYSICAL_STATE: PhysicalState = PhysicalState()
"""Frozen-at-import default used as a safe zero state before any tracking begins.

Do NOT mutate this instance — treat it as a read-only sentinel.
"""


# ---------------------------------------------------------------------------
# ContentGateConfig
# ---------------------------------------------------------------------------


@dataclass
class ContentGateConfig:
    """User-level content permission configuration.

    Stored in the ``app_config`` table and loaded at server start.
    ``per_persona_ceilings`` overrides ``global_content_ceiling`` for
    named personas/characters; an absent key means the global ceiling applies.

    Attributes:
        global_content_ceiling: Highest content tier allowed across all
            personas unless overridden by ``per_persona_ceilings``.
        age_verified: Whether the user has completed age verification.
            Gating logic must refuse to raise the ceiling above ``"edgy"``
            when this is ``False``.
        content_lock_enabled: If ``True``, settings are PIN-protected and
            cannot be changed without ``content_lock_password_hash``.
        content_lock_password_hash: bcrypt/argon2 hash of the lock PIN.
            Empty string when the lock is disabled.
        per_persona_ceilings: Mapping of ``persona_id`` → ceiling level.
            Takes precedence over ``global_content_ceiling`` for that persona.

    Example:
        >>> cfg = ContentGateConfig(global_content_ceiling="edgy", age_verified=True)
        >>> cfg.global_content_ceiling
        'edgy'
        >>> cfg.per_persona_ceilings
        {}
    """

    global_content_ceiling: ContentRatingLevel = "general"
    age_verified: bool = False
    content_lock_enabled: bool = False
    content_lock_password_hash: str = ""
    per_persona_ceilings: dict[str, ContentRatingLevel] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# SensoryWritingConfig
# ---------------------------------------------------------------------------


@dataclass
class SensoryWritingConfig:
    """Controls multi-sensory descriptive language in companion responses.

    When ``enabled`` is ``True`` the prompt builder weaves sensory detail
    directives into the system prompt.  Individual ``emphasis_*`` flags let
    users tune which senses are highlighted; ``intensity`` is a 0–10 dial
    that scales the density of sensory language across all active channels.

    Attributes:
        enabled: Master switch — no sensory directives are injected when
            ``False``, regardless of other flags.
        emphasis_sound: Include auditory details (rustling, heartbeat, etc.).
        emphasis_scent: Include olfactory details.
        emphasis_touch: Include tactile details.
        emphasis_temperature: Include temperature sensations.
        emphasis_texture: Include surface-texture descriptions.
        emphasis_taste: Include taste sensations (off by default — niche).
        intensity: Descriptive density on a 0–10 scale (5 = balanced).

    Example:
        >>> cfg = SensoryWritingConfig(enabled=True, intensity=7)
        >>> cfg.emphasis_taste
        False
        >>> cfg.emphasis_touch
        True
    """

    enabled: bool = False
    emphasis_sound: bool = True
    emphasis_scent: bool = True
    emphasis_touch: bool = True
    emphasis_temperature: bool = True
    emphasis_texture: bool = True
    emphasis_taste: bool = False
    intensity: int = 5


# ---------------------------------------------------------------------------
# Ceiling → maximum intimacy mapping
# ---------------------------------------------------------------------------

CEILING_MAX_INTIMACY: dict[str, int] = {
    "general": 30,
    "edgy": 60,
    "mature": 85,
    "explicit": 100,
}
"""Hard upper bound on ``IntimacyState.level`` for each content ceiling.

The intimacy scorer must clamp ``level`` to ``CEILING_MAX_INTIMACY[ceiling]``
after each turn to prevent drift beyond what the user has permitted.

Example:
    >>> CEILING_MAX_INTIMACY["mature"]
    85
    >>> CEILING_MAX_INTIMACY["general"]
    30
"""
