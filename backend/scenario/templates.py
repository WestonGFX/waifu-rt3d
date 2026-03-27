"""Scenario template CRUD and prompt-injection helpers.

Scenario templates are pre-defined or user-created scene contexts that
frame every interaction with a character.  A scenario persists across all
messages in a session, unlike the one-time greeting.

The module self-heals: ``_ensure_table`` is called at the top of every
public function so the ``scenario_templates`` table is created on first
use without requiring a migration.  The ``sessions`` table is expected to
already have ``scene_context`` (TEXT) and ``scene_enabled`` (INTEGER)
columns from schema v50.

DB tables touched:
    - ``scenario_templates``  — read/write (owned by this module)
    - ``sessions``            — write only (scene_context, scene_enabled)

Example::

    import sqlite3
    conn = sqlite3.connect(":memory:")
    t = create_template(
        char_id=1,
        title="Late Night Studio",
        description="Dae is painting at her easel by lamplight.",
        conn=conn,
        setting="indoor",
        time_of_day="night",
        mood="cozy",
        is_default=True,
    )
    prompt = build_scenario_prompt(t, char_name="Dae")
    print(prompt)
"""

from __future__ import annotations

import logging
import random
import sqlite3
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

_VALID_SETTINGS = frozenset({"indoor", "outdoor", "transit", "virtual"})
_VALID_TIMES = frozenset({"morning", "afternoon", "evening", "night", "any"})
_VALID_MOODS = frozenset(
    {"cozy", "tense", "romantic", "playful", "melancholy", "energetic"}
)


@dataclass
class ScenarioTemplate:
    """A single scenario template record.

    Attributes:
        id: Primary key (0 for unsaved instances).
        char_id: ID of the character this template belongs to.
        title: Short human-readable label, e.g. "Late Night Studio".
        description: Full scene description for prompt injection.
        setting: Location type — one of "indoor", "outdoor", "transit",
            "virtual".
        time_of_day: Time constraint — one of "morning", "afternoon",
            "evening", "night", "any".
        mood: Emotional tone — one of "cozy", "tense", "romantic",
            "playful", "melancholy", "energetic".
        is_default: When ``True`` this template is used when no specific
            scenario is selected for a session.
        is_builtin: When ``True`` the template ships with the character
            and was not created by the user.
        created_at: ISO 8601 datetime string from SQLite ``datetime('now')``.
    """

    id: int
    char_id: int
    title: str
    description: str
    setting: str = "indoor"
    time_of_day: str = "any"
    mood: str = "cozy"
    is_default: bool = False
    is_builtin: bool = False
    created_at: str = field(default="")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create the ``scenario_templates`` table if it does not exist.

    Idempotent — safe to call on every public function entry.  Uses
    ``CREATE TABLE IF NOT EXISTS`` so no error is raised on repeat calls.

    Args:
        conn: Active SQLite connection.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scenario_templates (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            description TEXT    NOT NULL,
            setting     TEXT    DEFAULT 'indoor',
            time_of_day TEXT    DEFAULT 'any',
            mood        TEXT    DEFAULT 'cozy',
            is_default  INTEGER DEFAULT 0,
            is_builtin  INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
        """
    )
    conn.commit()


def _row_to_template(row: tuple[Any, ...]) -> ScenarioTemplate:
    """Convert a raw DB row tuple into a ``ScenarioTemplate``.

    Expects columns in the order returned by ``_SELECT_COLS``.

    Args:
        row: Tuple of ``(id, char_id, title, description, setting,
            time_of_day, mood, is_default, is_builtin, created_at)``.

    Returns:
        Populated ``ScenarioTemplate`` instance.
    """
    return ScenarioTemplate(
        id=row[0],
        char_id=row[1],
        title=row[2],
        description=row[3],
        setting=row[4] or "indoor",
        time_of_day=row[5] or "any",
        mood=row[6] or "cozy",
        is_default=bool(row[7]),
        is_builtin=bool(row[8]),
        created_at=row[9] or "",
    )


_SELECT_COLS = (
    "id, char_id, title, description, setting, "
    "time_of_day, mood, is_default, is_builtin, created_at"
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_templates(char_id: int, conn: sqlite3.Connection) -> list[ScenarioTemplate]:
    """Return all scenario templates for a character, default-first.

    Args:
        char_id: Character to fetch templates for.
        conn: Active SQLite connection.

    Returns:
        List of ``ScenarioTemplate`` objects ordered so defaults come first,
        then by creation date ascending.  Empty list if none exist.

    Example:
        >>> templates = get_templates(char_id=1, conn=conn)
        >>> for t in templates:
        ...     print(t.title)
    """
    _ensure_table(conn)
    rows = conn.execute(
        f"SELECT {_SELECT_COLS} FROM scenario_templates "
        "WHERE char_id = ? "
        "ORDER BY is_default DESC, created_at ASC",
        (char_id,),
    ).fetchall()
    return [_row_to_template(r) for r in rows]


def get_template(
    template_id: int, conn: sqlite3.Connection
) -> ScenarioTemplate | None:
    """Fetch a single template by primary key.

    Args:
        template_id: The ``id`` of the template to load.
        conn: Active SQLite connection.

    Returns:
        ``ScenarioTemplate`` if found, ``None`` otherwise.

    Example:
        >>> t = get_template(template_id=3, conn=conn)
        >>> if t:
        ...     print(t.title)
    """
    _ensure_table(conn)
    row = conn.execute(
        f"SELECT {_SELECT_COLS} FROM scenario_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    return _row_to_template(row) if row else None


def get_active_template(
    char_id: int, session_id: int, conn: sqlite3.Connection
) -> ScenarioTemplate | None:
    """Return the currently active scenario for this session.

    Resolution order:
    1. Session-level override — reads ``sessions.scene_context`` as a
       template ID (integer stored as text) when ``scene_enabled = 1``.
    2. Character default — the template with ``is_default = 1`` for this
       character.
    3. ``None`` if neither exists.

    Args:
        char_id: Character ID.
        session_id: Current chat session ID.
        conn: Active SQLite connection.

    Returns:
        Active ``ScenarioTemplate``, or ``None`` if no scenario is set.

    Example:
        >>> active = get_active_template(char_id=1, session_id=5, conn=conn)
        >>> if active:
        ...     print(active.title)
    """
    _ensure_table(conn)

    # Step 1 — check session-level override
    try:
        row = conn.execute(
            "SELECT scene_context, scene_enabled FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if row and row[1]:  # scene_enabled is truthy
            raw_context: str | None = row[0]
            if raw_context and raw_context.isdigit():
                template = get_template(int(raw_context), conn)
                if template:
                    return template
    except sqlite3.OperationalError as exc:
        logger.debug("[ScenarioTemplates] sessions query failed: %s", exc)

    # Step 2 — fall back to character default
    default_row = conn.execute(
        f"SELECT {_SELECT_COLS} FROM scenario_templates "
        "WHERE char_id = ? AND is_default = 1 LIMIT 1",
        (char_id,),
    ).fetchone()
    return _row_to_template(default_row) if default_row else None


def create_template(
    char_id: int,
    title: str,
    description: str,
    conn: sqlite3.Connection,
    **kwargs: Any,
) -> ScenarioTemplate:
    """Create a new scenario template for a character.

    If ``is_default=True`` is passed, any existing default for this
    character is unset first to maintain the single-default invariant.

    Args:
        char_id: Character to attach the template to.
        title: Short human-readable label (e.g. "Late Night Studio").
        description: Full scene description for prompt injection.
        conn: Active SQLite connection (must be writable).
        **kwargs: Optional fields to override defaults:
            - ``setting`` (str): "indoor" | "outdoor" | "transit" | "virtual"
            - ``time_of_day`` (str): "morning" | "afternoon" | "evening" |
              "night" | "any"
            - ``mood`` (str): "cozy" | "tense" | "romantic" | "playful" |
              "melancholy" | "energetic"
            - ``is_default`` (bool): Make this the character default.
            - ``is_builtin`` (bool): Mark as a shipped/built-in template.

    Returns:
        The newly created ``ScenarioTemplate`` with its assigned ``id``.

    Raises:
        ValueError: If ``char_id`` is not positive or ``title``/``description``
            are empty strings.

    Example:
        >>> t = create_template(
        ...     char_id=1,
        ...     title="Late Night Studio",
        ...     description="Dae is painting at her easel by lamplight.",
        ...     conn=conn,
        ...     setting="indoor",
        ...     time_of_day="night",
        ...     mood="cozy",
        ...     is_default=True,
        ... )
        >>> print(t.id)  # assigned by DB
    """
    if char_id <= 0:
        raise ValueError(f"char_id must be positive, got {char_id!r}")
    if not title.strip():
        raise ValueError("title must not be empty")
    if not description.strip():
        raise ValueError("description must not be empty")

    _ensure_table(conn)

    setting = str(kwargs.get("setting", "indoor"))
    time_of_day = str(kwargs.get("time_of_day", "any"))
    mood = str(kwargs.get("mood", "cozy"))
    is_default = bool(kwargs.get("is_default", False))
    is_builtin = bool(kwargs.get("is_builtin", False))

    if is_default:
        # Clear any existing default for this character
        conn.execute(
            "UPDATE scenario_templates SET is_default = 0 WHERE char_id = ?",
            (char_id,),
        )

    cursor = conn.execute(
        "INSERT INTO scenario_templates "
        "(char_id, title, description, setting, time_of_day, mood, "
        " is_default, is_builtin) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            char_id,
            title.strip(),
            description.strip(),
            setting,
            time_of_day,
            mood,
            int(is_default),
            int(is_builtin),
        ),
    )
    conn.commit()

    new_id = cursor.lastrowid
    template = get_template(new_id, conn)
    if template is None:  # should never happen
        raise RuntimeError(f"Failed to retrieve newly created template id={new_id}")

    logger.info(
        "[ScenarioTemplates] Created template id=%d char_id=%d title=%r",
        template.id,
        char_id,
        title,
    )
    return template


def update_template(
    template_id: int, conn: sqlite3.Connection, **kwargs: Any
) -> bool:
    """Update fields on an existing scenario template.

    Only the keys present in ``kwargs`` are modified.  Unknown keys are
    silently ignored.  If ``is_default=True`` is passed, the existing
    default for the same character is unset first.

    Args:
        template_id: Primary key of the template to update.
        conn: Active SQLite connection (must be writable).
        **kwargs: Fields to update — any subset of ``title``, ``description``,
            ``setting``, ``time_of_day``, ``mood``, ``is_default``,
            ``is_builtin``.

    Returns:
        ``True`` if the template was found and updated, ``False`` if no
        template with that ID exists.

    Example:
        >>> updated = update_template(
        ...     template_id=3, conn=conn,
        ...     title="Rainy Afternoon Cafe",
        ...     mood="cozy",
        ... )
        >>> print(updated)
        True
    """
    _ensure_table(conn)

    existing = get_template(template_id, conn)
    if existing is None:
        logger.debug("[ScenarioTemplates] update_template: id=%d not found", template_id)
        return False

    allowed = {"title", "description", "setting", "time_of_day", "mood",
                "is_default", "is_builtin"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return True  # nothing to do

    if updates.get("is_default"):
        # Clear existing default for this character before promoting another
        conn.execute(
            "UPDATE scenario_templates SET is_default = 0 WHERE char_id = ?",
            (existing.char_id,),
        )

    set_clauses = ", ".join(f"{col} = ?" for col in updates)
    values = [
        int(v) if isinstance(v, bool) else v for v in updates.values()
    ]
    values.append(template_id)

    conn.execute(
        f"UPDATE scenario_templates SET {set_clauses} WHERE id = ?",
        values,
    )
    conn.commit()

    logger.info(
        "[ScenarioTemplates] Updated template id=%d fields=%s",
        template_id,
        list(updates.keys()),
    )
    return True


def delete_template(template_id: int, conn: sqlite3.Connection) -> bool:
    """Delete a scenario template by ID.

    Built-in templates can be deleted through this function — the caller is
    responsible for checking ``is_builtin`` before calling if they want to
    protect shipped templates.

    Args:
        template_id: Primary key of the template to remove.
        conn: Active SQLite connection (must be writable).

    Returns:
        ``True`` if a row was deleted, ``False`` if the ID did not exist.

    Example:
        >>> deleted = delete_template(template_id=7, conn=conn)
        >>> print(deleted)
        True
    """
    _ensure_table(conn)
    cursor = conn.execute(
        "DELETE FROM scenario_templates WHERE id = ?", (template_id,)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    if deleted:
        logger.info("[ScenarioTemplates] Deleted template id=%d", template_id)
    else:
        logger.debug("[ScenarioTemplates] delete_template: id=%d not found", template_id)
    return deleted


def activate_template(
    template_id: int, session_id: int, conn: sqlite3.Connection
) -> bool:
    """Set a scenario template as active for a session.

    Writes the template ID (as a string) to ``sessions.scene_context`` and
    sets ``sessions.scene_enabled = 1``.  Uses the existing v50 columns —
    no schema changes required.

    To deactivate a scenario, call with ``template_id = 0`` — this sets
    ``scene_enabled = 0`` and clears ``scene_context``.

    Args:
        template_id: ID of the template to activate.  Pass ``0`` to
            deactivate the scenario for this session.
        session_id: ID of the session to update.
        conn: Active SQLite connection (must be writable).

    Returns:
        ``True`` if the session row was found and updated, ``False`` if
        the session does not exist or the template was not found.

    Example:
        >>> activated = activate_template(
        ...     template_id=3, session_id=5, conn=conn
        ... )
        >>> print(activated)
        True
    """
    _ensure_table(conn)

    # Deactivate shortcut
    if template_id == 0:
        cursor = conn.execute(
            "UPDATE sessions SET scene_context = NULL, scene_enabled = 0 "
            "WHERE id = ?",
            (session_id,),
        )
        conn.commit()
        return cursor.rowcount > 0

    # Validate the template exists
    template = get_template(template_id, conn)
    if template is None:
        logger.warning(
            "[ScenarioTemplates] activate_template: template id=%d not found",
            template_id,
        )
        return False

    try:
        cursor = conn.execute(
            "UPDATE sessions SET scene_context = ?, scene_enabled = 1 "
            "WHERE id = ?",
            (str(template_id), session_id),
        )
        conn.commit()
    except sqlite3.OperationalError as exc:
        logger.error(
            "[ScenarioTemplates] activate_template failed session=%d: %s",
            session_id,
            exc,
        )
        return False

    activated = cursor.rowcount > 0
    if activated:
        logger.info(
            "[ScenarioTemplates] Activated template id=%d for session=%d",
            template_id,
            session_id,
        )
    else:
        logger.debug(
            "[ScenarioTemplates] activate_template: session id=%d not found",
            session_id,
        )
    return activated


def build_scenario_prompt(
    template: ScenarioTemplate, char_name: str = ""
) -> str:
    """Build a formatted prompt injection string from a scenario template.

    The returned string is suitable for direct insertion into
    ``_build_prompt_sections`` as a named section.  It tells the LLM the
    current setting and instructs it to stay consistent throughout the
    conversation.

    Args:
        template: The ``ScenarioTemplate`` to render.
        char_name: Optional character name to personalise the description
            line.  When provided it is prepended to the description.

    Returns:
        Multi-line string in the format::

            [Current Scenario: <title>]
            Setting: <Setting>, <Time of day>
            Mood: <mood>
            <description>
            Stay consistent with this scene throughout the conversation.

    Example:
        >>> t = ScenarioTemplate(
        ...     id=1, char_id=1,
        ...     title="Late Night Studio",
        ...     description="Painting at her easel by lamplight. Lo-fi plays softly.",
        ...     setting="indoor", time_of_day="night", mood="cozy",
        ...     is_default=True, is_builtin=True,
        ... )
        >>> print(build_scenario_prompt(t, char_name="Dae"))
        [Current Scenario: Late Night Studio]
        Setting: Indoor, Night
        Mood: Cozy
        Dae is painting at her easel by lamplight. Lo-fi plays softly.
        Stay consistent with this scene throughout the conversation.
    """
    setting_label = template.setting.capitalize()
    time_label = template.time_of_day.capitalize()
    mood_label = template.mood.capitalize()

    description_line = template.description.strip()
    if char_name and not description_line.lower().startswith(char_name.lower()):
        description_line = f"{char_name} — {description_line}"

    lines = [
        f"[Current Scenario: {template.title}]",
        f"Setting: {setting_label}, {time_label}",
        f"Mood: {mood_label}",
        description_line,
        "Stay consistent with this scene throughout the conversation.",
    ]
    return "\n".join(lines)


def generate_random_scenario(
    char_id: int,
    conn: sqlite3.Connection,
    mood: str = "any",
) -> ScenarioTemplate | None:
    """Pick a random scenario template for a character, optionally filtered by mood.

    Useful for "surprise me" functionality or variety-driven session starts.
    When ``mood="any"`` (the default) all templates for the character are
    eligible.

    Args:
        char_id: Character to pick a scenario for.
        conn: Active SQLite connection.
        mood: Optional mood filter.  Must match the ``mood`` column exactly
            (case-sensitive) or be ``"any"`` to skip filtering.

    Returns:
        A randomly selected ``ScenarioTemplate``, or ``None`` if no templates
        exist (or none match the requested mood).

    Example:
        >>> t = generate_random_scenario(char_id=1, conn=conn, mood="cozy")
        >>> if t:
        ...     print(t.title)
    """
    _ensure_table(conn)

    if mood and mood != "any":
        rows = conn.execute(
            f"SELECT {_SELECT_COLS} FROM scenario_templates "
            "WHERE char_id = ? AND mood = ?",
            (char_id, mood),
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT {_SELECT_COLS} FROM scenario_templates WHERE char_id = ?",
            (char_id,),
        ).fetchall()

    if not rows:
        logger.debug(
            "[ScenarioTemplates] generate_random_scenario: no templates "
            "for char_id=%d mood=%r",
            char_id,
            mood,
        )
        return None

    return _row_to_template(random.choice(rows))
