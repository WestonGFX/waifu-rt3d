"""Tests for backend.content.boundaries — BoundaryManager (F40).

All tests use an in-memory SQLite database with the relationship_boundaries
table created fresh per test so there are no ordering dependencies.
"""

from __future__ import annotations

import json
import sqlite3

import pytest

from backend.content.boundaries import BoundaryManager, Boundary


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DDL = """
CREATE TABLE IF NOT EXISTS relationship_boundaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    boundary_type TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'soft',
    description TEXT NOT NULL DEFAULT '',
    set_via TEXT NOT NULL DEFAULT 'form',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(char_id, boundary_type)
)
"""


@pytest.fixture()
def conn() -> sqlite3.Connection:
    """Return a fresh in-memory SQLite connection with the boundaries table."""
    db = sqlite3.connect(":memory:")
    db.execute(DDL)
    db.commit()
    return db


@pytest.fixture()
def mgr() -> BoundaryManager:
    """Return a BoundaryManager instance."""
    return BoundaryManager()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_set_and_get_boundary(mgr: BoundaryManager, conn: sqlite3.Connection) -> None:
    """set_boundary persists a row; get_boundaries retrieves it correctly."""
    b = mgr.set_boundary(
        char_id=1,
        boundary_type="pacing",
        level="soft",
        description="Slow burn preferred",
        set_via="form",
        conn=conn,
    )
    conn.commit()

    assert isinstance(b, Boundary)
    assert b.char_id == 1
    assert b.boundary_type == "pacing"
    assert b.level == "soft"
    assert b.description == "Slow burn preferred"
    assert b.set_via == "form"
    assert b.id > 0

    boundaries = mgr.get_boundaries(char_id=1, conn=conn)
    assert len(boundaries) == 1
    assert boundaries[0].description == "Slow burn preferred"


def test_hard_boundary_in_prompt(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Hard boundary produces an ABSOLUTE RULE directive in the prompt block."""
    mgr.set_boundary(
        char_id=1,
        boundary_type="language_intensity",
        level="hard",
        description="explicit sexual language",
        set_via="form",
        conn=conn,
    )
    conn.commit()

    block = mgr.build_constraint_prompt(char_id=1, conn=conn)

    assert "ABSOLUTE RULE:" in block
    assert "explicit sexual language" in block
    assert "off-limits" in block
    # Hard boundary should NOT use the soft-boundary phrasing
    assert "prefers to avoid" not in block


def test_soft_boundary_in_prompt(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Soft boundary produces a preference note, not an ABSOLUTE RULE."""
    mgr.set_boundary(
        char_id=2,
        boundary_type="pacing",
        level="soft",
        description="rushing into intimacy",
        set_via="chat",
        conn=conn,
    )
    conn.commit()

    block = mgr.build_constraint_prompt(char_id=2, conn=conn)

    assert "ABSOLUTE RULE:" not in block
    assert "prefers to avoid" in block
    assert "rushing into intimacy" in block
    assert "explicitly bring it up" in block


def test_no_boundaries_empty_prompt(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """build_constraint_prompt returns an empty string when no boundaries are set."""
    block = mgr.build_constraint_prompt(char_id=99, conn=conn)
    assert block == ""


def test_delete_boundary(mgr: BoundaryManager, conn: sqlite3.Connection) -> None:
    """Deleted boundary no longer appears in get_boundaries or the prompt."""
    mgr.set_boundary(
        char_id=1,
        boundary_type="topics_off_limits",
        level="hard",
        description="discussions about real-world politics",
        set_via="form",
        conn=conn,
    )
    conn.commit()

    # Confirm it exists first
    assert len(mgr.get_boundaries(char_id=1, conn=conn)) == 1

    mgr.delete_boundary(char_id=1, boundary_type="topics_off_limits", conn=conn)
    conn.commit()

    assert mgr.get_boundaries(char_id=1, conn=conn) == []
    assert mgr.build_constraint_prompt(char_id=1, conn=conn) == ""


def test_export_import_roundtrip(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Export from char 1 and import into char 2 produces identical boundaries."""
    # Set two boundaries on char 1
    mgr.set_boundary(1, "pacing", "soft", "slow burn", "form", conn)
    mgr.set_boundary(1, "language_intensity", "hard", "explicit content", "form", conn)
    conn.commit()

    json_str = mgr.export_boundaries(char_id=1, conn=conn)
    assert isinstance(json_str, str)

    # Verify export structure
    payload = json.loads(json_str)
    assert len(payload) == 2
    types_in_export = {p["boundary_type"] for p in payload}
    assert types_in_export == {"pacing", "language_intensity"}
    # char_id must NOT be in the export payload
    assert all("char_id" not in p for p in payload)

    # Import into char 2
    imported = mgr.import_boundaries(char_id=2, json_data=json_str, conn=conn)
    conn.commit()

    assert len(imported) == 2
    boundaries_char2 = mgr.get_boundaries(char_id=2, conn=conn)
    assert len(boundaries_char2) == 2

    descriptions_char2 = {b.description for b in boundaries_char2}
    assert "slow burn" in descriptions_char2
    assert "explicit content" in descriptions_char2

    # Original char 1 boundaries should be untouched
    assert len(mgr.get_boundaries(char_id=1, conn=conn)) == 2


def test_set_boundary_upsert(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Setting the same boundary_type twice updates rather than duplicates the row."""
    mgr.set_boundary(
        char_id=1,
        boundary_type="pacing",
        level="soft",
        description="initial description",
        set_via="form",
        conn=conn,
    )
    conn.commit()

    first_id = mgr.get_boundaries(char_id=1, conn=conn)[0].id

    # Update the same type
    mgr.set_boundary(
        char_id=1,
        boundary_type="pacing",
        level="hard",
        description="updated description",
        set_via="chat",
        conn=conn,
    )
    conn.commit()

    boundaries = mgr.get_boundaries(char_id=1, conn=conn)

    # Must still be exactly one row for this type
    assert len(boundaries) == 1
    assert boundaries[0].level == "hard"
    assert boundaries[0].description == "updated description"
    assert boundaries[0].set_via == "chat"

    # Row ID should be the same (upsert, not delete+insert)
    assert boundaries[0].id == first_id


def test_prompt_contains_header_and_footer(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """The constraint block is wrapped with recognisable header and footer markers."""
    mgr.set_boundary(1, "sensory_preferences", "soft", "bright lighting descriptions", "form", conn)
    conn.commit()

    block = mgr.build_constraint_prompt(char_id=1, conn=conn)

    assert "[User Boundaries & Comfort Preferences]" in block
    assert "[End Boundaries]" in block


def test_multiple_boundaries_all_appear(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """All set boundaries appear in the generated prompt block."""
    mgr.set_boundary(1, "pacing", "soft", "rushing romance", "form", conn)
    mgr.set_boundary(1, "language_intensity", "hard", "crude language", "form", conn)
    mgr.set_boundary(1, "power_dynamics", "soft", "dominant scenarios", "chat", conn)
    conn.commit()

    block = mgr.build_constraint_prompt(char_id=1, conn=conn)

    assert "rushing romance" in block
    assert "crude language" in block
    assert "dominant scenarios" in block


def test_delete_nonexistent_boundary_is_silent(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Deleting a boundary that does not exist raises no error."""
    # Should not raise
    mgr.delete_boundary(char_id=42, boundary_type="pacing", conn=conn)


def test_import_skips_invalid_records(
    mgr: BoundaryManager, conn: sqlite3.Connection
) -> None:
    """Import silently skips records missing required fields."""
    payload = json.dumps([
        {"boundary_type": "pacing", "level": "soft", "description": "valid entry"},
        {"boundary_type": "", "level": "soft", "description": "missing type"},
        {"level": "hard", "description": "no boundary_type key"},
        {"boundary_type": "language_intensity", "level": "hard", "description": ""},
    ])

    imported = mgr.import_boundaries(char_id=5, json_data=payload, conn=conn)
    conn.commit()

    # Only the fully valid record should have been imported
    assert len(imported) == 1
    assert imported[0].boundary_type == "pacing"
