"""Game companion memory — session history and LLM context injection.

Provides functions to create, update, and query game companion sessions.
Generates compact memory snippets for injection into LLM context so the
character can reference past gameplay experiences in conversation.

Tables used (schema v37):
    ``game_companion_sessions`` — Per-session metadata (game tag, duration, outcome)
    ``game_companion_reactions`` — Individual reactions within a session
"""

import json
import logging
import sqlite3
from datetime import datetime
from typing import Optional

logger = logging.getLogger("waifu.spectator.memory")


def create_session(
    con: sqlite3.Connection,
    character_id: int,
    game_tag: str,
    mode: str = "watch",
) -> int:
    """Create a new game companion session.

    Args:
        con: SQLite connection.
        character_id: Character participating in the session.
        game_tag: User-provided game name.
        mode: ``"watch"`` (user plays) or ``"play"`` (AI plays).

    Returns:
        The new session ID.

    Example:
        >>> session_id = create_session(con, char_id=1, game_tag="PokeRogue")
        >>> print(f"Session {session_id} started")
    """
    cur = con.execute(
        """INSERT INTO game_companion_sessions
           (character_id, game_tag, mode)
           VALUES (?, ?, ?)""",
        (character_id, game_tag, mode),
    )
    con.commit()
    session_id = cur.lastrowid
    logger.info(f"[GameMemory] Session {session_id} started: {game_tag} ({mode})")
    return session_id


def log_reaction(
    con: sqlite3.Connection,
    session_id: int,
    reaction_text: str,
    emotion: str = "neutral",
    urgency: float = 0.5,
    frame_hash: Optional[str] = None,
    action_taken: Optional[str] = None,
) -> None:
    """Log a single reaction to the database.

    Also increments the session's ``reaction_count``.

    Args:
        con: SQLite connection.
        session_id: Parent session ID.
        reaction_text: The character's reaction text.
        emotion: Emotion tag.
        urgency: Urgency score (0.0–1.0).
        frame_hash: Optional hash of the game frame that triggered this reaction.
        action_taken: Optional action description (for AI-plays mode).

    Example:
        >>> log_reaction(con, session_id=1, reaction_text="Nice catch!",
        ...              emotion="excited", urgency=0.7)
    """
    con.execute(
        """INSERT INTO game_companion_reactions
           (session_id, reaction_text, emotion, urgency, frame_hash, action_taken)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, reaction_text, emotion, urgency, frame_hash, action_taken),
    )
    con.execute(
        "UPDATE game_companion_sessions SET reaction_count = reaction_count + 1 WHERE id = ?",
        (session_id,),
    )
    con.commit()


def log_memorable_moment(
    con: sqlite3.Connection,
    session_id: int,
    text: str,
) -> None:
    """Append a memorable moment to the session's JSON array.

    Memorable moments are notable reactions (high urgency, dramatic events)
    that the character should remember and reference in conversation.

    Args:
        con: SQLite connection.
        session_id: Session to append the moment to.
        text: Concise description of the moment.

    Example:
        >>> log_memorable_moment(con, 1, "Caught a shiny Eevee on turn 3!")
    """
    row = con.execute(
        "SELECT memorable_moments FROM game_companion_sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if not row:
        return

    moments = []
    if row[0]:
        try:
            moments = json.loads(row[0])
        except (json.JSONDecodeError, TypeError):
            moments = []

    moments.append(text)
    # Keep at most 10 memorable moments per session
    if len(moments) > 10:
        moments = moments[-10:]

    con.execute(
        "UPDATE game_companion_sessions SET memorable_moments = ? WHERE id = ?",
        (json.dumps(moments), session_id),
    )
    con.commit()


def close_session(
    con: sqlite3.Connection,
    session_id: int,
    outcome: Optional[str] = None,
    notes: Optional[str] = None,
) -> None:
    """Close a game companion session, computing duration.

    Args:
        con: SQLite connection.
        session_id: Session to close.
        outcome: Optional result (``"win"``, ``"loss"``, ``"quit"``, ``None``).
        notes: Optional LLM-generated session summary.

    Example:
        >>> close_session(con, 1, outcome="win", notes="Great PokeRogue run!")
    """
    row = con.execute(
        "SELECT started_at FROM game_companion_sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if not row:
        return

    now = datetime.now(tz=None)  # Local time to match SQLite datetime('now')
    try:
        started = datetime.fromisoformat(row[0])
        duration = int((now - started).total_seconds())
    except (ValueError, TypeError):
        duration = 0

    con.execute(
        """UPDATE game_companion_sessions
           SET ended_at = datetime('now'),
               duration_seconds = ?,
               outcome = ?,
               notes = ?
           WHERE id = ?""",
        (duration, outcome, notes, session_id),
    )
    con.commit()
    logger.info(f"[GameMemory] Session {session_id} closed ({duration}s, outcome={outcome})")


def get_game_memory_snippet(
    con: sqlite3.Connection,
    character_id: int,
    max_sessions: int = 5,
    max_tokens_approx: int = 300,
) -> str:
    """Generate a compact game memory snippet for LLM context injection.

    Summarizes the character's recent game companion sessions into a
    brief text block suitable for including in the system prompt or
    context assembly.

    Args:
        con: SQLite connection.
        character_id: Character whose game history to summarize.
        max_sessions: Maximum number of recent sessions to include.
        max_tokens_approx: Rough token budget (chars // 4).

    Returns:
        A text string summarizing recent game sessions, or empty string
        if no game history exists.

    Example:
        >>> snippet = get_game_memory_snippet(con, char_id=1)
        >>> if snippet:
        ...     system_prompt += f"\\n\\nGame history:\\n{snippet}"
    """
    rows = con.execute(
        """SELECT game_tag, mode, started_at, duration_seconds,
                  reaction_count, outcome, memorable_moments, notes
           FROM game_companion_sessions
           WHERE character_id = ?
           ORDER BY started_at DESC
           LIMIT ?""",
        (character_id, max_sessions),
    ).fetchall()

    if not rows:
        return ""

    lines = ["[Recent gaming sessions]"]
    budget = max_tokens_approx * 4  # Rough chars budget

    for row in rows:
        game_tag, mode, started_at, duration, reactions, outcome, moments_json, notes = row

        # Format duration
        dur_str = f"{duration // 60}m" if duration and duration > 60 else f"{duration or 0}s"

        # Build session line
        line = f"- {game_tag} ({mode}, {dur_str}"
        if outcome:
            line += f", {outcome}"
        if reactions:
            line += f", {reactions} reactions"
        line += ")"

        # Add memorable moments
        if moments_json:
            try:
                moments = json.loads(moments_json)
                if moments:
                    line += ": " + "; ".join(moments[:3])
            except (json.JSONDecodeError, TypeError):
                pass

        # Budget check
        if len("\n".join(lines)) + len(line) > budget:
            break
        lines.append(line)

    return "\n".join(lines) if len(lines) > 1 else ""


def get_session_history(
    con: sqlite3.Connection,
    character_id: int,
    limit: int = 20,
) -> list[dict]:
    """Get recent game companion sessions for a character.

    Args:
        con: SQLite connection.
        character_id: Character whose sessions to retrieve.
        limit: Maximum number of sessions to return.

    Returns:
        List of session dicts with metadata.

    Example:
        >>> sessions = get_session_history(con, char_id=1)
        >>> for s in sessions:
        ...     print(f"{s['game_tag']} — {s['outcome']}")
    """
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """SELECT id, game_tag, mode, started_at, ended_at,
                  duration_seconds, reaction_count, outcome, notes
           FROM game_companion_sessions
           WHERE character_id = ?
           ORDER BY started_at DESC
           LIMIT ?""",
        (character_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]
