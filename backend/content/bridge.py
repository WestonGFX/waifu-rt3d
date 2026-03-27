"""Bridge between old integer content_filter_level and new content gating system.

Provides high-level functions that server.py calls to get content directive
blocks and update intimacy state.  Handles the DB layer (loading/saving
IntimacyState, PhysicalState, ContentGateConfig) and the mapping from the
legacy integer config to the new ContentRatingLevel system.

Legacy mapping (content_filter_level → ContentRatingLevel):
    -1 → explicit    (NSFW mode)
     0 → mature      (no explicit instruction)
     1 → edgy        (general adult)
     2 → general     (family-friendly)
     3 → general     (strict PG, with lock enabled)

Usage::

    from backend.content.bridge import get_content_blocks, update_intimacy_after_turn

    # In system prompt assembly:
    blocks = get_content_blocks(cfg, char_id, session_id, provider_name, conn)
    for block in blocks:
        sections.append({"name": "Content", "content": block})

    # After each chat turn:
    update_intimacy_after_turn(session_id, char_id, user_msg, ai_msg, cfg, conn)
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from typing import Any

from backend.content.gating import (
    resolve_effective_ceiling,
    get_bond_gated_level,
    is_cloud_provider,
)
from backend.content.intimacy import (
    evaluate_intimacy_shift,
    update_physical_state,
)
from backend.content.prompts import (
    build_content_directive_block,
    build_physical_awareness_block,
    build_intimacy_gate_block,
)
from backend.content.types import (
    ContentGateConfig,
    ContentRatingLevel,
    IntimacyState,
    PhysicalState,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Legacy config mapping
# ---------------------------------------------------------------------------

_LEGACY_LEVEL_MAP: dict[int, ContentRatingLevel] = {
    -1: "explicit",
    0: "mature",
    1: "edgy",
    2: "general",
    3: "general",
}


def _map_legacy_level(level: int) -> ContentRatingLevel:
    """Map old integer content_filter_level to ContentRatingLevel.

    Args:
        level: Integer from -1 to 3 (app.json ``content_filter_level``).

    Returns:
        Corresponding ContentRatingLevel string.

    Example:
        >>> _map_legacy_level(-1)
        'explicit'
        >>> _map_legacy_level(2)
        'general'
    """
    return _LEGACY_LEVEL_MAP.get(level, "general")


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _load_gate_config(conn: sqlite3.Connection) -> ContentGateConfig | None:
    """Load the global content gate config from DB.

    Args:
        conn: Active SQLite connection.

    Returns:
        ContentGateConfig if the v58 table exists and has a row,
        None if the table doesn't exist yet.
    """
    try:
        row = conn.execute(
            "SELECT global_content_ceiling, age_verified, "
            "content_lock_enabled, content_lock_password_hash "
            "FROM content_gate_config WHERE id = 1"
        ).fetchone()
        if not row:
            return None

        # Load per-persona ceilings
        per_persona: dict[str, ContentRatingLevel] = {}
        try:
            p_rows = conn.execute(
                "SELECT char_id, ceiling FROM persona_content_ceilings"
            ).fetchall()
            for p_row in p_rows:
                per_persona[str(p_row[0])] = p_row[1]
        except sqlite3.OperationalError:
            pass

        return ContentGateConfig(
            global_content_ceiling=row[0],
            age_verified=bool(row[1]),
            content_lock_enabled=bool(row[2]),
            content_lock_password_hash=row[3] or "",
            per_persona_ceilings=per_persona,
        )
    except sqlite3.OperationalError:
        # Table doesn't exist (pre-v58 schema)
        return None


def _load_intimacy_state(
    conn: sqlite3.Connection, session_id: int, char_id: int
) -> IntimacyState:
    """Load intimacy state from DB, creating a default if not found.

    Args:
        conn: Active SQLite connection.
        session_id: Current chat session ID.
        char_id: Character ID.

    Returns:
        IntimacyState for this session+character pair.
    """
    try:
        row = conn.execute(
            "SELECT level, trend, last_update_turn FROM intimacy_states "
            "WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        if row:
            return IntimacyState(
                level=row[0], trend=row[1], last_update_turn=row[2]
            )
    except sqlite3.OperationalError:
        pass
    return IntimacyState()


def _save_intimacy_state(
    conn: sqlite3.Connection,
    session_id: int,
    char_id: int,
    state: IntimacyState,
) -> None:
    """Persist intimacy state to DB.

    Args:
        conn: Active SQLite connection (must be writable).
        session_id: Current chat session ID.
        char_id: Character ID.
        state: IntimacyState to persist.
    """
    try:
        conn.execute(
            "INSERT OR REPLACE INTO intimacy_states "
            "(session_id, char_id, level, trend, last_update_turn, updated_at) "
            "VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (session_id, char_id, state.level, state.trend, state.last_update_turn),
        )
        conn.commit()
    except sqlite3.OperationalError as exc:
        logger.debug("[ContentBridge] Cannot save intimacy state: %s", exc)


def _load_physical_state(
    conn: sqlite3.Connection, session_id: int, char_id: int
) -> PhysicalState:
    """Load physical state from DB, creating a default if not found.

    Args:
        conn: Active SQLite connection.
        session_id: Current chat session ID.
        char_id: Character ID.

    Returns:
        PhysicalState for this session+character pair.
    """
    try:
        row = conn.execute(
            "SELECT user_clothing, companion_clothing, physical_context, "
            "arousal_level, recent_actions, last_updated_at "
            "FROM physical_states WHERE session_id = ? AND char_id = ?",
            (session_id, char_id),
        ).fetchone()
        if row:
            try:
                actions = json.loads(row[4]) if row[4] else []
            except (json.JSONDecodeError, TypeError):
                actions = []
            return PhysicalState(
                user_clothing=row[0],
                companion_clothing=row[1],
                physical_context=row[2],
                arousal_level=row[3],
                recent_actions=actions,
                last_updated_at=row[5] or 0.0,
            )
    except sqlite3.OperationalError:
        pass
    return PhysicalState()


def _save_physical_state(
    conn: sqlite3.Connection,
    session_id: int,
    char_id: int,
    state: PhysicalState,
) -> None:
    """Persist physical state to DB.

    Args:
        conn: Active SQLite connection (must be writable).
        session_id: Current chat session ID.
        char_id: Character ID.
        state: PhysicalState to persist.
    """
    try:
        conn.execute(
            "INSERT OR REPLACE INTO physical_states "
            "(session_id, char_id, user_clothing, companion_clothing, "
            "physical_context, arousal_level, recent_actions, last_updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                session_id,
                char_id,
                state.user_clothing,
                state.companion_clothing,
                state.physical_context,
                state.arousal_level,
                json.dumps(state.recent_actions),
                time.time(),
            ),
        )
        conn.commit()
    except sqlite3.OperationalError as exc:
        logger.debug("[ContentBridge] Cannot save physical state: %s", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_content_blocks(
    cfg: dict[str, Any],
    char_id: int,
    session_id: int,
    provider_name: str,
    conn: sqlite3.Connection,
) -> list[str]:
    """Build all applicable content directive blocks for system prompt injection.

    Reads config from DB (v58 schema) or falls back to the legacy integer
    ``content_filter_level`` from app.json.  Returns a list of non-empty
    strings, each representing a directive block to inject.

    Args:
        cfg: Application config dict (from app.json).
        char_id: Active character ID.
        session_id: Current chat session ID.
        provider_name: LLM provider name (e.g. ``"openai"``, ``"ollama"``).
        conn: Active SQLite connection.

    Returns:
        List of content directive strings to inject into the system prompt.
        May be empty if no content directives are needed.

    Example:
        >>> blocks = get_content_blocks(cfg, char_id=1, session_id=5,
        ...                             provider_name="ollama", conn=conn)
        >>> for block in blocks:
        ...     print(block[:50])
    """
    blocks: list[str] = []

    # Try new v58 config first, fall back to legacy integer
    gate_config = _load_gate_config(conn)
    if gate_config is not None:
        persona_ceiling = gate_config.per_persona_ceilings.get(str(char_id))
        effective_ceiling = resolve_effective_ceiling(
            gate_config, persona_ceiling, provider_name
        )
    else:
        # Legacy fallback: map integer to ContentRatingLevel
        legacy_level = cfg.get("content_filter_level", 0)
        effective_ceiling = _map_legacy_level(int(legacy_level))

    # Bond gating: further constrain ceiling based on character bond level
    effective_ceiling = get_bond_gated_level(char_id, effective_ceiling, conn)

    # Load intimacy state
    intimacy = _load_intimacy_state(conn, session_id, char_id)

    # 1. Content directive block (always present)
    directive = build_content_directive_block(effective_ceiling, intimacy.level)
    if directive:
        blocks.append(directive)

    # 2. Intimacy gate block (graduated guidance)
    gate = build_intimacy_gate_block(intimacy.level, effective_ceiling)
    if gate:
        blocks.append(gate)

    # 3. Physical awareness block (when intimacy > 30)
    if intimacy.level > 30:
        physical = _load_physical_state(conn, session_id, char_id)
        awareness = build_physical_awareness_block(physical)
        if awareness:
            blocks.append(awareness)

    return blocks


def update_intimacy_after_turn(
    session_id: int,
    char_id: int,
    user_msg: str,
    assistant_msg: str,
    cfg: dict[str, Any],
    conn: sqlite3.Connection,
    *,
    psychology_phase: str | None = None,
) -> IntimacyState:
    """Evaluate and persist intimacy/physical state changes after a chat turn.

    Should be called after each assistant response is generated.  Updates
    both intimacy score and physical state based on regex signal detection
    in the messages.

    Args:
        session_id: Current chat session ID.
        char_id: Character ID.
        user_msg: The user's message text.
        assistant_msg: The assistant's response text.
        cfg: Application config dict.
        conn: Active SQLite connection (must be writable).
        psychology_phase: Optional psychology phase (e.g. ``"detaching"``,
            ``"post_breakup"``) that caps intimacy at 30.

    Returns:
        The updated IntimacyState after evaluation.

    Example:
        >>> new_state = update_intimacy_after_turn(
        ...     session_id=5, char_id=1,
        ...     user_msg="You look beautiful tonight",
        ...     assistant_msg="*blushes* Thank you!",
        ...     cfg=cfg, conn=conn,
        ... )
        >>> print(f"Intimacy: {new_state.level}, trend: {new_state.trend}")
    """
    # Determine ceiling
    gate_config = _load_gate_config(conn)
    if gate_config is not None:
        persona_ceiling = gate_config.per_persona_ceilings.get(str(char_id))
        # Use local resolution (no provider cap) since intimacy is a content
        # tracking concern, not a provider safety concern
        from backend.content.types import CONTENT_RATING_ORDER
        ceilings = [gate_config.global_content_ceiling]
        if persona_ceiling:
            ceilings.append(persona_ceiling)
        effective_ceiling: ContentRatingLevel = min(
            ceilings, key=lambda c: CONTENT_RATING_ORDER.index(c)
        )
    else:
        legacy_level = cfg.get("content_filter_level", 0)
        effective_ceiling = _map_legacy_level(int(legacy_level))

    # Bond gating: further constrain ceiling based on character bond level
    effective_ceiling = get_bond_gated_level(char_id, effective_ceiling, conn)

    # Load current states
    intimacy = _load_intimacy_state(conn, session_id, char_id)
    physical = _load_physical_state(conn, session_id, char_id)

    # Evaluate shifts
    new_intimacy = evaluate_intimacy_shift(
        intimacy, user_msg, assistant_msg, effective_ceiling,
        psychology_phase=psychology_phase,
    )
    new_physical = update_physical_state(physical, user_msg, assistant_msg)

    # Persist
    _save_intimacy_state(conn, session_id, char_id, new_intimacy)
    _save_physical_state(conn, session_id, char_id, new_physical)

    if new_intimacy.level != intimacy.level:
        logger.info(
            "[ContentBridge] Intimacy updated char_id=%d session=%d: "
            "%d → %d (%s)",
            char_id, session_id, intimacy.level, new_intimacy.level,
            new_intimacy.trend,
        )

    return new_intimacy
