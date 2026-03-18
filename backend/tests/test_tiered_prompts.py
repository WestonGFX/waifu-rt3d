"""Tests for the tiered prompt system (Phase 1).

Validates:
  - Schema v52 migration (system_prompt_lite column)
  - Auto-tier selection by context budget
  - Manual tier overrides (lite/full/deep)
  - Fallback behavior when system_prompt_lite is NULL
  - /api/characters response includes system_prompt_lite
  - Extraction script tier parsing
"""

import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.server import _select_system_prompt


# ── _select_system_prompt tests ────────────────────────────────────────────────

class TestSelectSystemPrompt:
    """Tests for the _select_system_prompt() helper function."""

    FULL = "You are Rin (Akane), a tsundere with detailed personality..."
    LITE = "You are Rin. Tsundere. Sharp words, warm heart."

    def test_auto_selects_lite_for_small_context(self):
        """When context_limit ≤ 8K and lite exists, auto mode uses lite prompt."""
        cfg = {"context_limit": 8192}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert prompt == self.LITE
        assert skip_bible is True

    def test_auto_selects_full_no_bible_for_medium_context(self):
        """When context_limit is 8K-16K, auto uses full prompt but skips bible."""
        cfg = {"context_limit": 16384}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert prompt == self.FULL
        assert skip_bible is True

    def test_auto_selects_deep_for_large_context(self):
        """When context_limit > 16K, auto uses full prompt + bible."""
        cfg = {"context_limit": 131072}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert prompt == self.FULL
        assert skip_bible is False

    def test_lite_override_forces_lite(self):
        """prompt_tier='lite' uses lite prompt regardless of context size."""
        cfg = {"context_limit": 131072}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "lite")
        assert prompt == self.LITE
        assert skip_bible is True

    def test_full_override_forces_full_no_bible(self):
        """prompt_tier='full' uses full prompt, skips bible."""
        cfg = {"context_limit": 131072}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "full")
        assert prompt == self.FULL
        assert skip_bible is True

    def test_deep_override_forces_bible(self):
        """prompt_tier='deep' always includes character bible sections."""
        cfg = {"context_limit": 4096}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "deep")
        assert prompt == self.FULL
        assert skip_bible is False

    def test_lite_fallback_when_null(self):
        """If system_prompt_lite is NULL, falls back to full prompt."""
        cfg = {"context_limit": 8192}
        prompt, skip_bible = _select_system_prompt(self.FULL, None, cfg, "auto")
        # No lite available, so auto should use full
        assert prompt == self.FULL

    def test_lite_override_fallback_when_null(self):
        """If prompt_tier='lite' but lite is NULL, falls back to full."""
        cfg = {"context_limit": 131072}
        prompt, skip_bible = _select_system_prompt(self.FULL, None, cfg, "lite")
        assert prompt == self.FULL
        assert skip_bible is True

    def test_auto_defaults_large_context(self):
        """Auto mode defaults to 131072 if context_limit not in config."""
        cfg = {}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        # Default 131072 > 16384, so full + bible
        assert prompt == self.FULL
        assert skip_bible is False

    def test_boundary_8192_uses_lite(self):
        """Exact boundary: 8192 should use lite (≤8192)."""
        cfg = {"context_limit": 8192}
        prompt, _ = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert prompt == self.LITE

    def test_boundary_8193_uses_full(self):
        """Just above boundary: 8193 should use full."""
        cfg = {"context_limit": 8193}
        prompt, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert prompt == self.FULL
        assert skip_bible is True

    def test_boundary_16384_skips_bible(self):
        """Exact boundary: 16384 should skip bible."""
        cfg = {"context_limit": 16384}
        _, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert skip_bible is True

    def test_boundary_16385_includes_bible(self):
        """Just above boundary: 16385 should include bible."""
        cfg = {"context_limit": 16385}
        _, skip_bible = _select_system_prompt(self.FULL, self.LITE, cfg, "auto")
        assert skip_bible is False


# ── Extraction script tier parsing tests ───────────────────────────────────────

class TestTierParsing:
    """Tests for tools/extract_tiered_prompts.py parsing functions."""

    def _import_extract(self):
        """Import the extraction module."""
        sys.path.insert(0, str(ROOT / "tools"))
        import extract_tiered_prompts
        return extract_tiered_prompts

    def test_parse_tiers_with_markers(self):
        """Tier markers are correctly parsed into separate sections."""
        mod = self._import_extract()
        text = (
            "<!-- TIER: CORE -->\nYou are Rin.\n\n"
            "<!-- TIER: EXTENDED -->\nTrust Ramp: ...\n\n"
            "<!-- TIER: DEEP -->\nFamily: ..."
        )
        tiers = mod.parse_tiers(text)
        assert "CORE" in tiers
        assert "EXTENDED" in tiers
        assert "DEEP" in tiers
        assert "You are Rin." in tiers["CORE"]
        assert "Trust Ramp" in tiers["EXTENDED"]
        assert "Family" in tiers["DEEP"]

    def test_parse_tiers_no_markers(self):
        """When no markers, entire text becomes CORE."""
        mod = self._import_extract()
        text = "You are a helpful assistant with personality."
        tiers = mod.parse_tiers(text)
        assert list(tiers.keys()) == ["CORE"]
        assert tiers["CORE"] == text

    def test_build_lite_prompt(self):
        """Lite prompt extracts CORE only."""
        mod = self._import_extract()
        tiers = {"CORE": "Core content", "EXTENDED": "Extended", "DEEP": "Deep"}
        assert mod.build_lite_prompt(tiers) == "Core content"

    def test_build_full_prompt(self):
        """Full prompt concatenates all tiers in order."""
        mod = self._import_extract()
        tiers = {"CORE": "Core", "EXTENDED": "Extended", "DEEP": "Deep"}
        full = mod.build_full_prompt(tiers)
        assert full == "Core\n\nExtended\n\nDeep"

    def test_build_full_prompt_missing_deep(self):
        """Full prompt works when DEEP tier is missing."""
        mod = self._import_extract()
        tiers = {"CORE": "Core", "EXTENDED": "Extended"}
        full = mod.build_full_prompt(tiers)
        assert full == "Core\n\nExtended"

    def test_estimate_tokens(self):
        """Token estimation uses chars // 4."""
        mod = self._import_extract()
        assert mod.estimate_tokens("a" * 400) == 100
        assert mod.estimate_tokens("") == 0

    def test_extract_prompt_text(self):
        """Prompt text is extracted from markdown code block."""
        mod = self._import_extract()
        md = "# Title\n\n```\nYou are a character.\n```\n\nMore text."
        assert mod.extract_prompt_text(md) == "You are a character."


# ── Schema migration test ──────────────────────────────────────────────────────

class TestV52Migration:
    """Tests for the v52 schema migration."""

    def test_migration_adds_column(self, tmp_path):
        """Verify system_prompt_lite column is added by v52 migration."""
        db_path = tmp_path / "test.db"
        con = sqlite3.connect(db_path)
        # Create minimal characters table without the column
        con.execute("""
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY,
                name TEXT,
                system_prompt TEXT
            )
        """)
        con.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)")
        con.execute("INSERT INTO schema_version VALUES (51)")
        con.commit()

        from backend.preflight import migrate_to_v52
        result = migrate_to_v52(con)

        assert result is True
        cols = {r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()}
        assert "system_prompt_lite" in cols
        # schema_version table may have multiple rows (51, 52) — check max
        ver = con.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
        assert ver == 52
        con.close()

    def test_migration_idempotent(self, tmp_path):
        """Running v52 migration twice doesn't error."""
        db_path = tmp_path / "test.db"
        con = sqlite3.connect(db_path)
        con.execute("""
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY,
                name TEXT,
                system_prompt TEXT
            )
        """)
        con.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)")
        con.execute("INSERT INTO schema_version VALUES (51)")
        con.commit()

        from backend.preflight import migrate_to_v52
        migrate_to_v52(con)
        result = migrate_to_v52(con)  # Second call should return False
        assert result is False
        con.close()


# ── API response test ──────────────────────────────────────────────────────────

def test_api_characters_includes_lite(client):
    """GET /api/characters response includes system_prompt_lite field."""
    resp = client.get("/api/characters")
    assert resp.status_code == 200
    chars = resp.json()["characters"]
    assert len(chars) > 0
    # All characters should have the field (even if None)
    for char in chars:
        assert "system_prompt_lite" in char
