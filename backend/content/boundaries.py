"""Relationship Contract / Boundaries Agreement manager (F40).

Allows users to define per-character comfort boundaries that are injected
into the LLM system prompt as negative constraints.  Hard boundaries produce
an ABSOLUTE RULE directive; soft boundaries produce a gentler preference note.

Typical usage::

    from backend.content.boundaries import BoundaryManager

    mgr = BoundaryManager()
    mgr.set_boundary(
        char_id=1,
        boundary_type="language_intensity",
        level="hard",
        description="No explicit sexual language",
        set_via="form",
        conn=conn,
    )
    block = mgr.build_constraint_prompt(char_id=1, conn=conn)
    # Returns a string ready to prepend to the LLM system prompt.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

BOUNDARY_TYPES: list[str] = [
    "pacing",
    "language_intensity",
    "physical_comfort",
    "scenario_types",
    "topics_off_limits",
    "power_dynamics",
    "sensory_preferences",
]

BOUNDARY_LEVELS: list[str] = ["soft", "hard"]

# ---------------------------------------------------------------------------
# Pre-written negotiation / acknowledgment prompts
# ---------------------------------------------------------------------------

BOUNDARY_NEGOTIATION_SYSTEM = """You are having an in-character conversation about boundaries and comfort levels.
Ask the user about their preferences ONE TOPIC AT A TIME. Be natural and warm, not clinical.
Topics to cover (in order):
1. Physical comfort level (hand-holding through full intimacy)
2. Language preference (suggestive vs explicit vocabulary)
3. Pacing preference (slow-burn vs responsive vs direct)
4. Any topics they want to avoid entirely
5. Power dynamics preference (if relevant to their comfort)

After each answer, acknowledge warmly and move to the next topic.
At the end, summarize what you learned.

IMPORTANT: Frame everything as care and communication, not restriction."""

BOUNDARY_ACKNOWLEDGMENT_PROMPTS: dict[str, str] = {
    "confident": (
        "Got it. I want you to know — I take this seriously. "
        "Your comfort matters to me more than anything."
    ),
    "shy": (
        "O-okay... *nods* I'm glad you told me. "
        "I'll remember that, I promise."
    ),
    "playful": (
        "Noted! *salutes* Your wish is my command~ "
        "...but seriously, I hear you."
    ),
    "protective": (
        "Thank you for trusting me with that. "
        "I'll always respect your boundaries."
    ),
}

# ---------------------------------------------------------------------------
# Data type
# ---------------------------------------------------------------------------


@dataclass
class Boundary:
    """A single user-defined comfort boundary for one character.

    Attributes:
        id: Primary key from the ``relationship_boundaries`` table.
        char_id: The character this boundary applies to.
        boundary_type: One of ``BOUNDARY_TYPES``.
        level: Either ``"soft"`` or ``"hard"``.
        description: Free-text description of what the boundary covers.
        set_via: How the boundary was established — ``"chat"`` or ``"form"``.
        created_at: ISO-8601 UTC timestamp of first creation.
        updated_at: ISO-8601 UTC timestamp of most recent update.
    """

    id: int
    char_id: int
    boundary_type: str
    level: str
    description: str
    set_via: str
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------


class BoundaryManager:
    """CRUD interface for per-character comfort boundaries.

    All methods accept an explicit ``sqlite3.Connection`` so callers control
    transaction scope.  The manager never commits — callers must commit when
    appropriate.

    Example::

        mgr = BoundaryManager()
        with sqlite3.connect("app.db") as conn:
            mgr.set_boundary(1, "pacing", "soft", "Slow burn please", "form", conn)
            conn.commit()
            block = mgr.build_constraint_prompt(1, conn)
    """

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def get_boundaries(
        self, char_id: int, conn: sqlite3.Connection
    ) -> list[Boundary]:
        """Load all active boundaries for a character.

        Args:
            char_id: The character whose boundaries to retrieve.
            conn: Active SQLite connection.

        Returns:
            List of :class:`Boundary` objects, ordered by boundary_type
            for deterministic prompt assembly.  Returns an empty list if
            no boundaries have been set or if the table does not exist.

        Example::

            boundaries = mgr.get_boundaries(char_id=1, conn=conn)
            for b in boundaries:
                print(b.boundary_type, b.level)
        """
        try:
            rows = conn.execute(
                "SELECT id, char_id, boundary_type, level, description, "
                "       set_via, created_at, updated_at "
                "FROM relationship_boundaries "
                "WHERE char_id = ? "
                "ORDER BY boundary_type",
                (char_id,),
            ).fetchall()
        except sqlite3.OperationalError as exc:
            logger.debug("[BoundaryManager] Cannot load boundaries: %s", exc)
            return []

        return [
            Boundary(
                id=int(row[0]),
                char_id=int(row[1]),
                boundary_type=str(row[2]),
                level=str(row[3]),
                description=str(row[4]),
                set_via=str(row[5]),
                created_at=str(row[6]),
                updated_at=str(row[7]),
            )
            for row in rows
        ]

    def set_boundary(
        self,
        char_id: int,
        boundary_type: str,
        level: str,
        description: str,
        set_via: str,
        conn: sqlite3.Connection,
    ) -> Boundary:
        """Create or update a boundary for a character.

        Uses ``INSERT OR REPLACE`` on the ``(char_id, boundary_type)`` unique
        constraint, so calling this twice for the same type updates the
        existing row rather than inserting a duplicate.

        Args:
            char_id: The character this boundary applies to.
            boundary_type: One of ``BOUNDARY_TYPES`` (not validated here so
                callers can extend the list without changing this module).
            level: ``"soft"`` or ``"hard"``.
            description: Human-readable description of the boundary.
            set_via: ``"chat"`` or ``"form"`` — tracks how the boundary was
                established for audit purposes.
            conn: Active SQLite connection.  Caller is responsible for commit.

        Returns:
            The newly created or updated :class:`Boundary` with the assigned
            ``id`` populated from the database.

        Raises:
            sqlite3.OperationalError: If the ``relationship_boundaries`` table
                does not exist.

        Example::

            b = mgr.set_boundary(
                char_id=1,
                boundary_type="language_intensity",
                level="hard",
                description="No explicit sexual language",
                set_via="form",
                conn=conn,
            )
            print(b.id)  # assigned by DB
        """
        conn.execute(
            "INSERT INTO relationship_boundaries "
            "    (char_id, boundary_type, level, description, set_via, "
            "     created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now')) "
            "ON CONFLICT(char_id, boundary_type) DO UPDATE SET "
            "    level       = excluded.level, "
            "    description = excluded.description, "
            "    set_via     = excluded.set_via, "
            "    updated_at  = datetime('now')",
            (char_id, boundary_type, level, description, set_via),
        )

        row = conn.execute(
            "SELECT id, char_id, boundary_type, level, description, "
            "       set_via, created_at, updated_at "
            "FROM relationship_boundaries "
            "WHERE char_id = ? AND boundary_type = ?",
            (char_id, boundary_type),
        ).fetchone()

        return Boundary(
            id=int(row[0]),
            char_id=int(row[1]),
            boundary_type=str(row[2]),
            level=str(row[3]),
            description=str(row[4]),
            set_via=str(row[5]),
            created_at=str(row[6]),
            updated_at=str(row[7]),
        )

    def delete_boundary(
        self,
        char_id: int,
        boundary_type: str,
        conn: sqlite3.Connection,
    ) -> None:
        """Remove a specific boundary for a character.

        Silently does nothing if the row does not exist, so callers do not
        need to check existence first.

        Args:
            char_id: The character whose boundary to remove.
            boundary_type: The boundary category to delete.
            conn: Active SQLite connection.  Caller is responsible for commit.

        Example::

            mgr.delete_boundary(char_id=1, boundary_type="pacing", conn=conn)
            conn.commit()
        """
        try:
            conn.execute(
                "DELETE FROM relationship_boundaries "
                "WHERE char_id = ? AND boundary_type = ?",
                (char_id, boundary_type),
            )
        except sqlite3.OperationalError as exc:
            logger.debug("[BoundaryManager] delete_boundary error: %s", exc)

    # ------------------------------------------------------------------
    # Prompt injection
    # ------------------------------------------------------------------

    def build_constraint_prompt(
        self, char_id: int, conn: sqlite3.Connection
    ) -> str:
        """Generate the negative constraint block for LLM system prompt injection.

        Hard boundaries are prefixed with ``ABSOLUTE RULE:`` to signal
        unconditional enforcement.  Soft boundaries use gentler language
        indicating a preference rather than a prohibition.

        The returned block is self-contained — it can be appended directly
        to a system prompt or injected as a named section.

        Args:
            char_id: The character whose boundaries to render.
            conn: Active SQLite connection.

        Returns:
            A multi-line string with one directive per boundary, wrapped in
            a ``[User Boundaries & Comfort Preferences]`` header and footer.
            Returns an empty string if no boundaries are set for this
            character so callers can skip injection cleanly.

        Example::

            block = mgr.build_constraint_prompt(char_id=1, conn=conn)
            if block:
                prompt_sections.append({"name": "Boundaries", "content": block})
        """
        boundaries = self.get_boundaries(char_id, conn)
        if not boundaries:
            return ""

        hard = [b for b in boundaries if b.level == "hard"]
        soft = [b for b in boundaries if b.level != "hard"]

        lines: list[str] = ["[User Boundaries & Comfort Preferences]"]

        for b in hard:
            lines.append(
                f"ABSOLUTE RULE: Never write about {b.description}. "
                f"The user has explicitly said this is off-limits."
            )

        for b in soft:
            lines.append(
                f"The user prefers to avoid {b.description}. "
                f"Only include if they explicitly bring it up first."
            )

        lines.append("[End Boundaries]")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Import / export
    # ------------------------------------------------------------------

    def export_boundaries(
        self, char_id: int, conn: sqlite3.Connection
    ) -> str:
        """Export all boundaries for a character as a JSON string.

        The exported payload omits ``id``, ``char_id``, ``created_at``, and
        ``updated_at`` fields so the data can be imported cleanly into a
        different character without ID conflicts.

        Args:
            char_id: The character whose boundaries to export.
            conn: Active SQLite connection.

        Returns:
            JSON string containing a list of boundary dicts with keys
            ``boundary_type``, ``level``, ``description``, and ``set_via``.
            Returns ``"[]"`` when no boundaries are set.

        Example::

            json_str = mgr.export_boundaries(char_id=1, conn=conn)
            with open("boundaries_backup.json", "w") as f:
                f.write(json_str)
        """
        boundaries = self.get_boundaries(char_id, conn)
        payload = [
            {
                "boundary_type": b.boundary_type,
                "level": b.level,
                "description": b.description,
                "set_via": b.set_via,
            }
            for b in boundaries
        ]
        return json.dumps(payload, ensure_ascii=False, indent=2)

    def import_boundaries(
        self,
        char_id: int,
        json_data: str,
        conn: sqlite3.Connection,
    ) -> list[Boundary]:
        """Import boundaries from a JSON string into a character.

        Accepts the format produced by :meth:`export_boundaries`.  Each entry
        is upserted via :meth:`set_boundary`, so existing boundaries for the
        same ``boundary_type`` are overwritten.

        Entries with missing or invalid required fields are skipped with a
        debug log entry rather than raising, so a partially valid payload
        still imports as much as it can.

        Args:
            char_id: The target character to assign boundaries to.
            json_data: JSON string — list of dicts with at minimum
                ``boundary_type``, ``level``, and ``description`` keys.
                ``set_via`` defaults to ``"form"`` if absent.
            conn: Active SQLite connection.  Caller is responsible for commit.

        Returns:
            List of :class:`Boundary` objects that were successfully imported.

        Raises:
            json.JSONDecodeError: If ``json_data`` is not valid JSON.

        Example::

            imported = mgr.import_boundaries(
                char_id=2,
                json_data=mgr.export_boundaries(char_id=1, conn=conn),
                conn=conn,
            )
            conn.commit()
            print(f"Imported {len(imported)} boundaries")
        """
        records: list[dict[str, str]] = json.loads(json_data)
        imported: list[Boundary] = []

        for record in records:
            boundary_type = record.get("boundary_type", "")
            level = record.get("level", "")
            description = record.get("description", "")
            set_via = record.get("set_via", "form")

            if not boundary_type or not level or not description:
                logger.debug(
                    "[BoundaryManager] Skipping invalid import record: %r", record
                )
                continue

            try:
                b = self.set_boundary(
                    char_id=char_id,
                    boundary_type=boundary_type,
                    level=level,
                    description=description,
                    set_via=set_via,
                    conn=conn,
                )
                imported.append(b)
            except sqlite3.OperationalError as exc:
                logger.debug(
                    "[BoundaryManager] Failed to import record %r: %s", record, exc
                )

        return imported
