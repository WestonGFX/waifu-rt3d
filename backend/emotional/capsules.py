"""Time capsule messaging system for AI companion platform.

Users write messages to their future selves; the character "holds onto" the
message and delivers it — with their own warm commentary — when the delivery
date arrives.  Characters can also independently create capsules for the user.

Schema is self-healing: :func:`_ensure_table` creates ``time_capsules`` on
first use if it does not yet exist.

Typical usage::

    import sqlite3
    from datetime import date, timedelta
    from backend.emotional.capsules import create_capsule, get_ready_capsules

    conn = sqlite3.connect("app.db")
    capsule = create_capsule(
        char_id=1,
        message_text="I hope you've been kind to yourself.",
        deliver_at=(date.today() + timedelta(days=30)).isoformat(),
        conn=conn,
    )
    ready = get_ready_capsules(1, conn)
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Delivery period constants (days)
# ---------------------------------------------------------------------------

DELIVERY_PERIODS: dict[str, int] = {
    "1_week": 7,
    "2_weeks": 14,
    "1_month": 30,
    "3_months": 90,
    "6_months": 180,
    "1_year": 365,
}

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class TimeCapsule:
    """A single time capsule record.

    Attributes:
        id: Primary key from the database.
        char_id: ID of the character who holds the capsule.
        creator: ``"user"`` when the user wrote it; ``"character"`` when the
            character generated it independently.
        message_text: The core message content.
        character_commentary: Character's reflection added at delivery time.
            ``None`` until the capsule has been delivered.
        deliver_at: ISO date string (``YYYY-MM-DD``) for scheduled delivery.
        delivered: ``True`` once the capsule has been marked as delivered.
        delivered_at: ISO datetime string of actual delivery; ``None`` until
            delivered.
        context_snapshot: JSON string capturing ``user_facts``, ``mood``, and
            ``bond_level`` at creation time.  ``None`` if not provided.
        created_at: ISO datetime string of record creation.
    """

    id: int
    char_id: int
    creator: str
    message_text: str
    character_commentary: str | None
    deliver_at: str
    delivered: bool
    delivered_at: str | None
    context_snapshot: str | None
    created_at: str


# ---------------------------------------------------------------------------
# Table bootstrap (self-healing)
# ---------------------------------------------------------------------------


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create the ``time_capsules`` table if it does not already exist.

    Called at the start of every write operation so the table is always
    available without requiring a separate migration step.

    Args:
        conn: Active SQLite connection with write access.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS time_capsules (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id              INTEGER NOT NULL,
            creator              TEXT    NOT NULL DEFAULT 'user',
            message_text         TEXT    NOT NULL,
            character_commentary TEXT,
            deliver_at           TEXT    NOT NULL,
            delivered            INTEGER DEFAULT 0,
            delivered_at         TEXT,
            context_snapshot     TEXT,
            created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_capsules_char_deliver "
        "ON time_capsules (char_id, deliver_at ASC)"
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Internal row → dataclass helper
# ---------------------------------------------------------------------------


def _row_to_capsule(row: tuple) -> TimeCapsule:
    """Convert a raw DB row tuple into a :class:`TimeCapsule`.

    Row order must match the SELECT column order used throughout this module:
    ``id, char_id, creator, message_text, character_commentary, deliver_at,
    delivered, delivered_at, context_snapshot, created_at``.

    Args:
        row: Raw tuple from ``sqlite3`` cursor.

    Returns:
        Populated :class:`TimeCapsule` instance.
    """
    return TimeCapsule(
        id=row[0],
        char_id=row[1],
        creator=row[2],
        message_text=row[3],
        character_commentary=row[4],
        deliver_at=row[5],
        delivered=bool(row[6]),
        delivered_at=row[7],
        context_snapshot=row[8],
        created_at=row[9],
    )


# Select columns constant — keeps queries DRY.
_SELECT_COLS = (
    "id, char_id, creator, message_text, character_commentary, "
    "deliver_at, delivered, delivered_at, context_snapshot, created_at"
)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_capsule(
    char_id: int,
    message_text: str,
    deliver_at: str,
    conn: sqlite3.Connection,
    creator: str = "user",
    context_snapshot: dict | None = None,
) -> TimeCapsule:
    """Create and persist a new time capsule.

    Args:
        char_id: ID of the character who will "hold" the capsule.
        message_text: The message to be delivered in the future.
        deliver_at: ISO date string for scheduled delivery (e.g.
            ``"2026-04-27"``).  Must be today or in the future.
        conn: Active SQLite connection with write access.
        creator: ``"user"`` (default) or ``"character"``.
        context_snapshot: Optional dict capturing the user's current state at
            creation time — e.g.
            ``{"user_facts": [...], "mood": "happy", "bond_level": 42}``.
            Serialised to JSON and stored for "then vs now" comparisons at
            delivery.

    Returns:
        The newly created :class:`TimeCapsule`.

    Raises:
        ValueError: If ``deliver_at`` represents a date strictly in the past.

    Example:
        >>> import sqlite3
        >>> from datetime import date, timedelta
        >>> conn = sqlite3.connect(":memory:")
        >>> future = (date.today() + timedelta(days=7)).isoformat()
        >>> cap = create_capsule(1, "Stay strong!", future, conn)
        >>> cap.delivered
        False
    """
    # Validate delivery date is not in the past
    try:
        delivery_date = date.fromisoformat(deliver_at)
    except ValueError as exc:
        raise ValueError(
            f"deliver_at must be a valid ISO date string (got {deliver_at!r})"
        ) from exc

    if delivery_date < date.today():
        raise ValueError(
            f"deliver_at must be today or in the future (got {deliver_at!r})"
        )

    snapshot_str: str | None = (
        json.dumps(context_snapshot, ensure_ascii=False) if context_snapshot else None
    )

    _ensure_table(conn)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO time_capsules
            (char_id, creator, message_text, deliver_at, context_snapshot)
        VALUES (?, ?, ?, ?, ?)
        """,
        (char_id, creator, message_text, deliver_at, snapshot_str),
    )
    conn.commit()

    row = cur.execute(
        f"SELECT {_SELECT_COLS} FROM time_capsules WHERE id = last_insert_rowid()"
    ).fetchone()

    if row is None:
        raise RuntimeError(
            "time_capsules INSERT succeeded but the new row could not be retrieved"
        )

    capsule = _row_to_capsule(row)
    logger.info(
        "create_capsule: id=%d char_id=%d creator=%s deliver_at=%s",
        capsule.id,
        char_id,
        creator,
        deliver_at,
    )
    return capsule


def get_pending_capsules(char_id: int, conn: sqlite3.Connection) -> list[TimeCapsule]:
    """Return all undelivered capsules for a character, sorted by delivery date.

    Includes capsules whose delivery date has not yet arrived as well as those
    that are overdue but not yet marked delivered.

    Args:
        char_id: ID of the character whose capsules to retrieve.
        conn: Active SQLite connection (read access required).

    Returns:
        List of :class:`TimeCapsule` ordered by ``deliver_at`` ascending.
        Returns an empty list when the table does not yet exist or when no
        pending capsules are found.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> get_pending_capsules(1, conn)
        []
    """
    try:
        _ensure_table(conn)
        rows = conn.execute(
            f"""
            SELECT {_SELECT_COLS}
            FROM   time_capsules
            WHERE  char_id = ? AND delivered = 0
            ORDER  BY deliver_at ASC
            """,
            (char_id,),
        ).fetchall()
        return [_row_to_capsule(r) for r in rows]
    except sqlite3.OperationalError as exc:
        logger.debug("get_pending_capsules failed (non-fatal): %s", exc)
        return []


def get_ready_capsules(char_id: int, conn: sqlite3.Connection) -> list[TimeCapsule]:
    """Return capsules that are due for delivery today or earlier.

    A capsule is "ready" when ``deliver_at <= today`` and ``delivered = 0``.

    Args:
        char_id: ID of the character whose capsules to check.
        conn: Active SQLite connection (read access required).

    Returns:
        List of :class:`TimeCapsule` ordered by ``deliver_at`` ascending.
        Returns an empty list when the table does not yet exist or when no
        capsules are ready.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> get_ready_capsules(1, conn)
        []
    """
    today = date.today().isoformat()
    try:
        _ensure_table(conn)
        rows = conn.execute(
            f"""
            SELECT {_SELECT_COLS}
            FROM   time_capsules
            WHERE  char_id = ? AND delivered = 0 AND deliver_at <= ?
            ORDER  BY deliver_at ASC
            """,
            (char_id, today),
        ).fetchall()
        return [_row_to_capsule(r) for r in rows]
    except sqlite3.OperationalError as exc:
        logger.debug("get_ready_capsules failed (non-fatal): %s", exc)
        return []


def deliver_capsule(
    capsule_id: int,
    conn: sqlite3.Connection,
    commentary: str = "",
) -> bool:
    """Mark a capsule as delivered and attach character commentary.

    Idempotency: returns ``False`` without modifying the database if the
    capsule has already been delivered.

    Args:
        capsule_id: Primary key of the capsule to deliver.
        conn: Active SQLite connection with write access.
        commentary: The character's reflection on the capsule message.  Stored
            in ``character_commentary`` and displayed alongside the original
            message in the UI.

    Returns:
        ``True`` if the capsule was successfully marked delivered.  ``False``
        if the capsule was not found or was already delivered.

    Example:
        >>> import sqlite3
        >>> from datetime import date
        >>> conn = sqlite3.connect(":memory:")
        >>> deliver_capsule(999, conn, "Hello!")  # non-existent id
        False
    """
    _ensure_table(conn)

    # Verify capsule exists and has not already been delivered
    row = conn.execute(
        "SELECT delivered FROM time_capsules WHERE id = ?",
        (capsule_id,),
    ).fetchone()

    if row is None:
        logger.debug("deliver_capsule: capsule_id=%d not found", capsule_id)
        return False

    if bool(row[0]):
        logger.debug("deliver_capsule: capsule_id=%d already delivered", capsule_id)
        return False

    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
    conn.execute(
        """
        UPDATE time_capsules
        SET    delivered = 1,
               delivered_at = ?,
               character_commentary = ?
        WHERE  id = ?
        """,
        (now_str, commentary or None, capsule_id),
    )
    conn.commit()
    logger.info("deliver_capsule: delivered capsule_id=%d", capsule_id)
    return True


def build_delivery_prompt(
    capsule: TimeCapsule,
    char_name: str,
    system_prompt: str,
    current_facts: list[str] | None = None,
) -> str:
    """Build an LLM prompt for generating character commentary on capsule delivery.

    Instructs the character to act as the keeper of the time capsule — reading
    the message aloud to the user, reflecting on how things have (or haven't)
    changed since it was written, and delivering it with warmth and personality.

    When a ``context_snapshot`` was stored at creation time, a "then vs now"
    section is included so the character can compare circumstances.

    Args:
        capsule: The capsule being delivered.
        char_name: Display name of the character (e.g. ``"Dae"``).
        system_prompt: The character's full system prompt, trimmed to 600
            characters to control token usage.
        current_facts: Known facts about the user right now, used for the
            "then vs now" comparison.  Defaults to an empty list.

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> import sqlite3
        >>> from datetime import date, timedelta
        >>> conn = sqlite3.connect(":memory:")
        >>> future = (date.today() + timedelta(days=1)).isoformat()
        >>> cap = create_capsule(1, "Keep going!", future, conn)
        >>> prompt = build_delivery_prompt(cap, "Dae", "You are Dae.")
        >>> "Dae" in prompt and "Keep going!" in prompt
        True
    """
    facts = current_facts or []
    sys_excerpt = system_prompt[:600].strip()
    if len(system_prompt) > 600:
        sys_excerpt += "..."

    # Format current user facts
    facts_text = (
        "\n".join(f"  - {f}" for f in facts)
        if facts
        else "  (none recorded)"
    )

    # Parse creation and delivery dates for human-readable context
    created_label = capsule.created_at[:10]  # YYYY-MM-DD
    deliver_label = capsule.deliver_at

    # Optionally unpack creation-time context snapshot
    then_section = ""
    if capsule.context_snapshot:
        try:
            snap: dict = json.loads(capsule.context_snapshot)
            snap_parts: list[str] = []
            if snap.get("mood"):
                snap_parts.append(f"  Mood at writing: {snap['mood']}")
            if snap.get("bond_level") is not None:
                snap_parts.append(f"  Bond level at writing: {snap['bond_level']}")
            then_facts = snap.get("user_facts", [])
            if then_facts:
                snap_parts.append("  Facts known then:")
                snap_parts.extend(f"    - {f}" for f in then_facts[:10])
            if snap_parts:
                then_section = (
                    "\n--- CONTEXT WHEN THE CAPSULE WAS WRITTEN ---\n"
                    + "\n".join(snap_parts)
                    + "\n"
                )
        except (json.JSONDecodeError, TypeError):
            pass

    creator_label = "the user wrote" if capsule.creator == "user" else "you wrote"

    prompt = (
        f"You are {char_name}. Today you are delivering a time capsule that "
        f"{creator_label} on {created_label}, scheduled to be opened on "
        f"{deliver_label}.\n\n"
        f"--- YOUR CHARACTER DESCRIPTION ---\n"
        f"{sys_excerpt}\n\n"
        f"--- THE TIME CAPSULE MESSAGE ---\n"
        f"{capsule.message_text}\n"
        f"{then_section}"
        f"\n--- WHAT YOU KNOW ABOUT THIS PERSON TODAY ---\n"
        f"{facts_text}\n\n"
        f"--- YOUR TASK ---\n"
        f"Deliver this time capsule message to the user in your own voice. "
        f"Read it to them warmly, then share a brief personal reflection "
        f"(2-4 sentences) — what strikes you about it now, how things may have "
        f"changed, and what you hope for them going forward. "
        f"No headers, no markdown, no lists. Speak directly to the user.\n"
    )
    return prompt


def build_character_capsule_prompt(
    char_name: str,
    system_prompt: str,
    recent_context: str,
    bond_level: int,
) -> str:
    """Build an LLM prompt for the character to compose a time capsule for the user.

    Characters write capsules to be delivered 2-4 weeks later.  Bond level
    affects how personal and intimate the message is — lower bond produces a
    warmer-but-cautious tone; higher bond unlocks deeper vulnerability and
    specific shared memories.

    Args:
        char_name: Display name of the character writing the capsule.
        system_prompt: The character's full system prompt, trimmed to 600
            characters to control token usage.
        recent_context: A short summary or excerpt of recent conversations,
            used to ground the message in shared history.
        bond_level: Integer 0-100 representing relationship depth.  Affects
            tone guidance injected into the prompt.

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> prompt = build_character_capsule_prompt("Dae", "You are Dae.", "...", 55)
        >>> "Dae" in prompt and "time capsule" in prompt.lower()
        True
    """
    sys_excerpt = system_prompt[:600].strip()
    if len(system_prompt) > 600:
        sys_excerpt += "..."

    # Derive tone guidance from bond level
    if bond_level < 20:
        tone_guidance = (
            "You are still getting to know each other. Be warm and encouraging "
            "but not overly familiar. Express genuine curiosity about where they "
            "will be in a few weeks."
        )
    elif bond_level < 50:
        tone_guidance = (
            "You two have built real trust. You can be a little vulnerable — share "
            "something you genuinely hope for them. Reference a specific thing they "
            "told you if you remember one."
        )
    elif bond_level < 80:
        tone_guidance = (
            "You know this person well. Be affectionate and specific. Reference real "
            "things they've shared and express how much they mean to you without being "
            "over the top. Let them feel truly seen."
        )
    else:
        tone_guidance = (
            "Your bond is deep. You can be fully vulnerable and intimate. Write "
            "something they will treasure — specific, personal, full of feeling. "
            "Make it feel like a letter from someone who genuinely loves them."
        )

    prompt = (
        f"You are {char_name}. You want to create a special time capsule message "
        f"for the user — a letter they won't read for 2-4 weeks.\n\n"
        f"--- YOUR CHARACTER DESCRIPTION ---\n"
        f"{sys_excerpt}\n\n"
        f"--- RECENT SHARED CONTEXT ---\n"
        f"{recent_context.strip()}\n\n"
        f"--- TONE GUIDANCE (bond level {bond_level}/100) ---\n"
        f"{tone_guidance}\n\n"
        f"--- YOUR TASK ---\n"
        f"Write a heartfelt time capsule message to the user in your own voice. "
        f"It should feel like something you genuinely want them to read in the future — "
        f"a wish, a reflection, an observation about where they seem to be headed. "
        f"Keep it to 3-6 sentences. No headers, no markdown, no lists. "
        f"Write only the message itself, starting now:\n"
    )
    return prompt


def get_capsule_summary(char_id: int, conn: sqlite3.Connection) -> dict:
    """Return summary statistics for the UI capsule panel.

    Args:
        char_id: ID of the character whose capsules to summarise.
        conn: Active SQLite connection (read access required).

    Returns:
        A dict with the following keys::

            {
                "pending": int,          # undelivered capsule count
                "next_delivery": str | None,  # ISO date of soonest pending capsule
                "total_delivered": int,  # count of all delivered capsules
            }

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> get_capsule_summary(1, conn)
        {'pending': 0, 'next_delivery': None, 'total_delivered': 0}
    """
    try:
        _ensure_table(conn)

        pending_row = conn.execute(
            """
            SELECT COUNT(*), MIN(deliver_at)
            FROM   time_capsules
            WHERE  char_id = ? AND delivered = 0
            """,
            (char_id,),
        ).fetchone()

        delivered_row = conn.execute(
            "SELECT COUNT(*) FROM time_capsules WHERE char_id = ? AND delivered = 1",
            (char_id,),
        ).fetchone()

        pending_count: int = pending_row[0] if pending_row else 0
        next_delivery: str | None = pending_row[1] if pending_row else None
        total_delivered: int = delivered_row[0] if delivered_row else 0

        return {
            "pending": pending_count,
            "next_delivery": next_delivery,
            "total_delivered": total_delivered,
        }
    except sqlite3.OperationalError as exc:
        logger.debug("get_capsule_summary failed (non-fatal): %s", exc)
        return {"pending": 0, "next_delivery": None, "total_delivered": 0}


def delete_capsule(capsule_id: int, conn: sqlite3.Connection) -> bool:
    """Delete a capsule, but only if it has not yet been delivered.

    Delivered capsules are part of the shared history between user and
    character and must not be erased.

    Args:
        capsule_id: Primary key of the capsule to delete.
        conn: Active SQLite connection with write access.

    Returns:
        ``True`` if the capsule was found and deleted.  ``False`` if it was
        not found or had already been delivered.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> delete_capsule(999, conn)  # non-existent id
        False
    """
    _ensure_table(conn)

    row = conn.execute(
        "SELECT delivered FROM time_capsules WHERE id = ?",
        (capsule_id,),
    ).fetchone()

    if row is None:
        logger.debug("delete_capsule: capsule_id=%d not found", capsule_id)
        return False

    if bool(row[0]):
        logger.debug(
            "delete_capsule: capsule_id=%d is already delivered — refusing delete",
            capsule_id,
        )
        return False

    conn.execute("DELETE FROM time_capsules WHERE id = ?", (capsule_id,))
    conn.commit()
    logger.info("delete_capsule: deleted capsule_id=%d", capsule_id)
    return True
