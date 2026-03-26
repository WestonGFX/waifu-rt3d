"""Content ceiling resolution and permission checking.

Provides provider-aware ceiling resolution (cloud providers are capped at
"mature"), bond-gated content unlocking, intimacy-to-rating mapping, and
password hashing utilities for the content-lock feature.

Ported from AnimeGirly's battle-tested TypeScript implementation.

Bond-gated thresholds (configurable via ``BOND_CONTENT_THRESHOLDS``):
    * general   (Level 1): always available (bond >= 0)
    * edgy      (Level 2): bond >= 20
    * mature    (Level 3): bond >= 50
    * explicit  (Level 4): bond >= 80
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import sqlite3

from backend.content.types import (
    CEILING_MAX_INTIMACY,
    CONTENT_RATING_ORDER,
    ContentGateConfig,
    ContentRatingLevel,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cloud-provider constants
# ---------------------------------------------------------------------------

CLOUD_PROVIDERS: frozenset[str] = frozenset({"openai", "anthropic", "google"})

# Cloud providers enforce a hard ceiling because we cannot guarantee that
# explicit output won't violate their Terms of Service.
CLOUD_PROVIDER_CEILING: ContentRatingLevel = "mature"

# ---------------------------------------------------------------------------
# Bond-gating thresholds
# ---------------------------------------------------------------------------

#: Minimum bond level required to access each content tier.
#: Keyed by :data:`~backend.content.types.ContentRatingLevel` string.
#: Adjust these constants to rebalance progression without touching logic.
BOND_CONTENT_THRESHOLDS: dict[str, int] = {
    "general": 0,
    "edgy": 20,
    "mature": 50,
    "explicit": 80,
}
"""Bond level floor required to unlock each content rating tier.

``"general"`` is always accessible (threshold 0).  Each higher tier
requires a minimum bond level; if the user's bond falls below the
threshold for their chosen ceiling, the ceiling is silently lowered to
the highest tier their bond permits.

Example:
    >>> BOND_CONTENT_THRESHOLDS["edgy"]
    20
    >>> BOND_CONTENT_THRESHOLDS["explicit"]
    80
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def resolve_effective_ceiling(
    global_config: ContentGateConfig,
    persona_ceiling: ContentRatingLevel | None,
    provider_name: str,
) -> ContentRatingLevel:
    """Return the most-restrictive content ceiling that applies to this request.

    Three independent ceilings are evaluated and the lowest (most restrictive)
    wins:

    1. ``global_config.global_content_ceiling`` — always applied.
    2. ``persona_ceiling`` — applied when the active persona has its own cap.
    3. The cloud-provider cap (``"mature"``) — applied when *provider_name*
       belongs to :data:`CLOUD_PROVIDERS`.

    Args:
        global_config: Application-level content-gate configuration, including
            the global ceiling and any per-persona overrides.
        persona_ceiling: The ceiling configured on the currently active persona,
            or ``None`` if the persona has no ceiling of its own.
        provider_name: Identifier of the active LLM provider (e.g.
            ``"openai"``, ``"ollama"``, ``"lm_studio"``).

    Returns:
        The effective :data:`ContentRatingLevel` after applying all applicable
        restrictions.

    Example:
        >>> from backend.content.types import ContentGateConfig
        >>> cfg = ContentGateConfig(global_content_ceiling="explicit",
        ...                         per_persona_ceilings={})
        >>> resolve_effective_ceiling(cfg, None, "ollama")
        'explicit'
        >>> resolve_effective_ceiling(cfg, None, "openai")
        'mature'
        >>> resolve_effective_ceiling(cfg, "edgy", "ollama")
        'edgy'
        >>> resolve_effective_ceiling(cfg, "explicit", "openai")
        'mature'
        >>> cfg2 = ContentGateConfig(global_content_ceiling="general",
        ...                          per_persona_ceilings={})
        >>> resolve_effective_ceiling(cfg2, "explicit", "openai")
        'general'
    """
    candidates: list[ContentRatingLevel] = [global_config.global_content_ceiling]

    if persona_ceiling is not None:
        candidates.append(persona_ceiling)

    if is_cloud_provider(provider_name):
        candidates.append(CLOUD_PROVIDER_CEILING)

    # The most-restrictive ceiling is the one with the smallest index in the
    # canonical ordering: general(0) < edgy(1) < mature(2) < explicit(3).
    return min(candidates, key=lambda lvl: CONTENT_RATING_ORDER.index(lvl))


def is_cloud_provider(provider_name: str) -> bool:
    """Return ``True`` if *provider_name* is a known cloud LLM provider.

    The comparison is case-insensitive so ``"OpenAI"``, ``"OPENAI"``, and
    ``"openai"`` all match.

    Args:
        provider_name: The provider identifier string to test.

    Returns:
        ``True`` when the provider is in :data:`CLOUD_PROVIDERS`, ``False``
        otherwise.

    Example:
        >>> is_cloud_provider("openai")
        True
        >>> is_cloud_provider("OpenAI")
        True
        >>> is_cloud_provider("ollama")
        False
        >>> is_cloud_provider("lm_studio")
        False
    """
    return provider_name.lower() in CLOUD_PROVIDERS


def get_content_level_for_intimacy(intimacy_level: int) -> ContentRatingLevel:
    """Map a 0-100 intimacy score to its corresponding content-rating band.

    The thresholds are intentionally generous at the low end to keep most
    casual interactions firmly in the "general" band.

    Bands:
        * ``0–29``  → ``"general"``
        * ``30–59`` → ``"edgy"``
        * ``60–84`` → ``"mature"``
        * ``85–100`` → ``"explicit"``

    Args:
        intimacy_level: Integer score in the range ``[0, 100]`` (inclusive).
            Values outside this range are accepted without error; they will
            naturally fall into the nearest band.

    Returns:
        The :data:`ContentRatingLevel` that corresponds to *intimacy_level*.

    Example:
        >>> get_content_level_for_intimacy(0)
        'general'
        >>> get_content_level_for_intimacy(29)
        'general'
        >>> get_content_level_for_intimacy(30)
        'edgy'
        >>> get_content_level_for_intimacy(59)
        'edgy'
        >>> get_content_level_for_intimacy(60)
        'mature'
        >>> get_content_level_for_intimacy(85)
        'explicit'
        >>> get_content_level_for_intimacy(100)
        'explicit'
    """
    if intimacy_level < 30:
        return "general"
    if intimacy_level < 60:
        return "edgy"
    if intimacy_level < 85:
        return "mature"
    return "explicit"


def is_content_allowed(
    intimacy_level: int,
    effective_ceiling: ContentRatingLevel,
) -> bool:
    """Return ``True`` when the intimacy level's band does not exceed the ceiling.

    Looks up the content band for *intimacy_level* via
    :func:`get_content_level_for_intimacy`, then checks whether that band's
    index in :data:`CONTENT_RATING_ORDER` is at most that of
    *effective_ceiling*.

    Args:
        intimacy_level: Integer score in the range ``[0, 100]``.
        effective_ceiling: The resolved ceiling (typically the output of
            :func:`resolve_effective_ceiling`).

    Returns:
        ``True`` if the content is within the ceiling, ``False`` if it would
        exceed it.

    Example:
        >>> is_content_allowed(25, "general")
        True
        >>> is_content_allowed(30, "general")
        False
        >>> is_content_allowed(80, "mature")
        True
        >>> is_content_allowed(85, "mature")
        False
        >>> is_content_allowed(100, "explicit")
        True
    """
    required_level = get_content_level_for_intimacy(intimacy_level)
    return CONTENT_RATING_ORDER.index(required_level) <= CONTENT_RATING_ORDER.index(
        effective_ceiling
    )


def bond_allowed_ceiling(bond_level: int) -> ContentRatingLevel:
    """Return the highest content tier accessible at *bond_level*.

    Iterates :data:`BOND_CONTENT_THRESHOLDS` from most permissive to most
    restrictive and returns the highest tier whose threshold is satisfied.
    Because ``"general"`` has a threshold of 0 the function always returns
    at least ``"general"``.

    Args:
        bond_level: Current bond level for the character (0–100).

    Returns:
        The highest :data:`~backend.content.types.ContentRatingLevel` the
        bond level permits.

    Example:
        >>> bond_allowed_ceiling(0)
        'general'
        >>> bond_allowed_ceiling(19)
        'general'
        >>> bond_allowed_ceiling(20)
        'edgy'
        >>> bond_allowed_ceiling(50)
        'mature'
        >>> bond_allowed_ceiling(80)
        'explicit'
        >>> bond_allowed_ceiling(100)
        'explicit'
    """
    # Walk the ordering from most permissive (highest index) down so we can
    # return the first tier whose threshold is satisfied.
    for level_name in reversed(CONTENT_RATING_ORDER):
        if bond_level >= BOND_CONTENT_THRESHOLDS[level_name]:
            return level_name  # type: ignore[return-value]
    # Unreachable: "general" always has threshold 0 and bond_level >= 0.
    return "general"


def get_bond_gated_level(
    character_id: int,
    user_content_level: ContentRatingLevel,
    db_conn: sqlite3.Connection,
) -> ContentRatingLevel:
    """Return the effective content ceiling after applying the bond gate.

    Looks up the current bond level for *character_id* and computes the
    highest content tier permitted by that bond level via
    :func:`bond_allowed_ceiling`.  The result is then the *minimum* of the
    user's chosen ceiling and the bond-allowed ceiling so that bond gates
    always take priority over manual settings.

    If the ``character_relationships`` row is missing or the bond columns
    are absent (e.g. pre-v56 schema), the function defaults to ``"general"``
    so that a missing record never accidentally grants elevated access.

    Args:
        character_id: Primary key of the character to look up.
        user_content_level: The content ceiling the user has manually
            selected (e.g. ``"explicit"``).
        db_conn: Open ``sqlite3.Connection``; a cursor is created internally
            so the caller retains transaction control.

    Returns:
        The effective :data:`~backend.content.types.ContentRatingLevel`
        after the bond gate is applied — always ``<= user_content_level``.

    Example:
        >>> # bond_level=30 → bond ceiling "edgy"; user wants "explicit"
        >>> # result must be "edgy"
        >>> level = get_bond_gated_level(1, "explicit", conn)
        >>> level
        'edgy'
    """
    try:
        cur = db_conn.cursor()
        cur.execute(
            """
            SELECT bond_level
              FROM character_relationships
             WHERE char_id = ?
            """,
            (character_id,),
        )
        row = cur.fetchone()
    except sqlite3.OperationalError as exc:
        logger.warning(
            "get_bond_gated_level: could not query bond level for char_id=%d: %s",
            character_id,
            exc,
        )
        return "general"

    if row is None:
        # No relationship record yet — treat as bond level 0.
        logger.debug(
            "get_bond_gated_level: no relationship row for char_id=%d, defaulting to 'general'",
            character_id,
        )
        return "general"

    bond_level = int(row[0] or 0)
    bond_ceiling = bond_allowed_ceiling(bond_level)

    # Return the more restrictive of the two ceilings.
    user_idx = CONTENT_RATING_ORDER.index(user_content_level)
    bond_idx = CONTENT_RATING_ORDER.index(bond_ceiling)
    effective_idx = min(user_idx, bond_idx)
    return CONTENT_RATING_ORDER[effective_idx]  # type: ignore[return-value]


def hash_content_lock_password(password: str) -> str:
    """Return the SHA-256 hex digest of *password* for content-lock storage.

    Passwords are never stored in plaintext; only the digest is persisted.
    Use :func:`verify_content_lock_password` to authenticate user input.

    Args:
        password: The plaintext password to hash.

    Returns:
        A 64-character lowercase hex string (SHA-256 digest).

    Example:
        >>> digest = hash_content_lock_password("hunter2")
        >>> len(digest)
        64
        >>> digest == hash_content_lock_password("hunter2")
        True
        >>> digest == hash_content_lock_password("Hunter2")
        False
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_content_lock_password(input_password: str, stored_hash: str) -> bool:
    """Return ``True`` when *input_password* matches the *stored_hash*.

    Uses :func:`hmac.compare_digest` for a constant-time comparison that
    prevents timing-based attacks from leaking information about the hash.

    Args:
        input_password: The plaintext password supplied by the user.
        stored_hash: The SHA-256 hex digest produced by a previous call to
            :func:`hash_content_lock_password`.

    Returns:
        ``True`` if the password is correct, ``False`` otherwise.

    Example:
        >>> h = hash_content_lock_password("s3cr3t")
        >>> verify_content_lock_password("s3cr3t", h)
        True
        >>> verify_content_lock_password("wrong", h)
        False
    """
    candidate_hash = hash_content_lock_password(input_password)
    return hmac.compare_digest(candidate_hash, stored_hash)
