"""Tests for the Photo Mode gallery system (schema v51).

Tests cover:
- GalleryManager CRUD operations (save, list, get, update, delete)
- Pagination and filtering (character_id, favorites_only)
- Schema v51 migration (screenshots table creation)
- File cleanup on delete
- PNG dimension parsing fallback
"""

import base64
import io
import sqlite3
import struct

import pytest

from backend.gallery.manager import GalleryManager, ScreenshotMeta


# ── Fixtures ──────────────────────────────────────────────────────────────


def _create_test_db() -> sqlite3.Connection:
    """Create an in-memory SQLite database with the screenshots table."""
    con = sqlite3.connect(":memory:")
    con.execute("""
        CREATE TABLE IF NOT EXISTS screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            character_id INTEGER,
            character_name TEXT,
            emotion TEXT,
            gesture TEXT,
            quality INTEGER DEFAULT 1,
            transparent INTEGER DEFAULT 0,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            file_path TEXT NOT NULL,
            caption TEXT DEFAULT '',
            favorite INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    con.commit()
    return con


def _make_minimal_png(width: int = 100, height: int = 50) -> bytes:
    """Create a minimal valid PNG file (1x1 pixel expanded to given dimensions).

    For testing purposes, we create a proper PNG header so _png_dimensions()
    works, followed by minimal IDAT chunk data.

    Args:
        width: Image width for the IHDR header.
        height: Image height for the IHDR header.

    Returns:
        Bytes of a minimal (but parseable) PNG file.
    """
    try:
        from PIL import Image
        img = Image.new("RGBA", (width, height), (255, 0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return buf.getvalue()
    except ImportError:
        # Fallback: construct a minimal PNG manually
        # PNG signature
        sig = b"\x89PNG\r\n\x1a\n"
        # IHDR chunk (13 bytes data)
        ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        ihdr_crc = 0  # CRC doesn't matter for our dimension test
        ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
        # Empty IDAT + IEND (not valid for rendering but fine for dimension parse)
        idat = struct.pack(">I", 0) + b"IDAT" + struct.pack(">I", 0)
        iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", 0)
        return sig + ihdr + idat + iend


def _make_data_url(png_bytes: bytes) -> str:
    """Encode PNG bytes as a data URL string.

    Args:
        png_bytes: Raw PNG bytes.

    Returns:
        Data URL string (``data:image/png;base64,...``).
    """
    b64 = base64.b64encode(png_bytes).decode()
    return f"data:image/png;base64,{b64}"


# ── Unit Tests ────────────────────────────────────────────────────────────


class TestGalleryManagerSave:
    """Test GalleryManager.save() — writes file, thumbnail, and DB row."""

    def test_save_creates_row(self, tmp_path, monkeypatch):
        """Save should insert a row and return ScreenshotMeta."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        png = _make_minimal_png(200, 100)
        data_url = _make_data_url(png)

        meta = manager.save(
            con, data_url=data_url,
            character_id=1, character_name="Sakura",
            emotion="happy", gesture="wave",
            quality=2, transparent=False,
        )

        assert isinstance(meta, ScreenshotMeta)
        assert meta.character_name == "Sakura"
        assert meta.emotion == "happy"
        assert meta.quality == 2
        assert meta.width == 200
        assert meta.height == 100
        assert meta.file_size > 0

        # File should exist on disk
        full_path = tmp_path / "screenshots" / f"{meta.uuid}.png"
        assert full_path.exists()

        # Thumbnail should exist
        thumb_path = tmp_path / "screenshots" / "thumbs" / f"{meta.uuid}.png"
        assert thumb_path.exists()

        con.close()

    def test_save_invalid_base64_raises(self, tmp_path, monkeypatch):
        """Save should raise ValueError for bad base64."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()

        # base64.b64decode(validate=True) rejects non-base64 chars like '!'
        with pytest.raises((ValueError, Exception)):
            manager.save(con, data_url="data:image/png;base64,NOT_VALID!!!")

        con.close()


class TestGalleryManagerList:
    """Test GalleryManager.list() — pagination and filtering."""

    def _seed(self, manager, con, tmp_path, count=5):
        """Insert multiple test screenshots."""
        for i in range(count):
            png = _make_minimal_png(100, 50)
            manager.save(
                con, data_url=_make_data_url(png),
                character_id=(1 if i < 3 else 2),
                character_name=("Sakura" if i < 3 else "Rin"),
                emotion="happy",
            )

    def test_list_returns_all(self, tmp_path, monkeypatch):
        """List without filters returns all screenshots."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        self._seed(manager, con, tmp_path)

        result = manager.list(con)
        assert result["total"] == 5
        assert len(result["items"]) == 5

        con.close()

    def test_list_filter_by_character(self, tmp_path, monkeypatch):
        """List with character_id filter returns only that character's shots."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        self._seed(manager, con, tmp_path)

        result = manager.list(con, character_id=1)
        assert result["total"] == 3

        result = manager.list(con, character_id=2)
        assert result["total"] == 2

        con.close()

    def test_list_favorites_only(self, tmp_path, monkeypatch):
        """List with favorites_only=True returns only favorited shots."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        self._seed(manager, con, tmp_path)

        # Favorite two screenshots
        manager.update(con, 1, favorite=True)
        manager.update(con, 3, favorite=True)

        result = manager.list(con, favorites_only=True)
        assert result["total"] == 2

        con.close()

    def test_list_pagination(self, tmp_path, monkeypatch):
        """List respects limit and offset."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        self._seed(manager, con, tmp_path)

        result = manager.list(con, limit=2, offset=0)
        assert len(result["items"]) == 2
        assert result["total"] == 5

        result = manager.list(con, limit=2, offset=4)
        assert len(result["items"]) == 1

        con.close()


class TestGalleryManagerUpdate:
    """Test GalleryManager.update() — favorite toggle and caption edit."""

    def test_toggle_favorite(self, tmp_path, monkeypatch):
        """Update favorite should toggle the flag."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        png = _make_minimal_png()
        meta = manager.save(con, data_url=_make_data_url(png))

        assert meta.favorite is False

        updated = manager.update(con, meta.id, favorite=True)
        assert updated.favorite is True

        updated = manager.update(con, meta.id, favorite=False)
        assert updated.favorite is False

        con.close()

    def test_update_caption(self, tmp_path, monkeypatch):
        """Update caption should persist the new text."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        png = _make_minimal_png()
        meta = manager.save(con, data_url=_make_data_url(png))

        updated = manager.update(con, meta.id, caption="Best screenshot ever!")
        assert updated.caption == "Best screenshot ever!"

        con.close()

    def test_update_nonexistent_returns_none(self, tmp_path, monkeypatch):
        """Update on non-existent ID should return None."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()

        result = manager.update(con, 999, favorite=True)
        assert result is None

        con.close()


class TestGalleryManagerDelete:
    """Test GalleryManager.delete() — removes DB row and files."""

    def test_delete_removes_files_and_row(self, tmp_path, monkeypatch):
        """Delete should remove PNG, thumbnail, and DB row."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        png = _make_minimal_png()
        meta = manager.save(con, data_url=_make_data_url(png))

        full_path = tmp_path / "screenshots" / f"{meta.uuid}.png"
        thumb_path = tmp_path / "screenshots" / "thumbs" / f"{meta.uuid}.png"
        assert full_path.exists()
        assert thumb_path.exists()

        deleted = manager.delete(con, meta.id)
        assert deleted is True
        assert not full_path.exists()
        assert not thumb_path.exists()

        # DB row should be gone
        assert manager.get(con, meta.id) is None

        con.close()

    def test_delete_nonexistent_returns_false(self, tmp_path, monkeypatch):
        """Delete on non-existent ID should return False."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()

        assert manager.delete(con, 999) is False

        con.close()


class TestScreenshotMetaSerialization:
    """Test ScreenshotMeta.to_dict() — URL generation and boolean conversion."""

    def test_to_dict_has_urls(self, tmp_path, monkeypatch):
        """to_dict() should include computed url and thumb_url fields."""
        import backend.gallery.manager as mgr_mod
        monkeypatch.setattr(mgr_mod, "SCREENSHOTS_DIR", tmp_path / "screenshots")
        monkeypatch.setattr(mgr_mod, "THUMBS_DIR", tmp_path / "screenshots" / "thumbs")

        manager = GalleryManager()
        con = _create_test_db()
        png = _make_minimal_png()
        meta = manager.save(con, data_url=_make_data_url(png))

        d = meta.to_dict()
        assert d["url"].startswith("/files/images/screenshots/")
        assert d["thumb_url"].startswith("/files/images/screenshots/thumbs/")
        assert isinstance(d["favorite"], bool)
        assert isinstance(d["transparent"], bool)

        con.close()


class TestPngDimensions:
    """Test GalleryManager._png_dimensions() fallback parser."""

    def test_parses_valid_png_header(self):
        """Should extract width/height from a PNG IHDR chunk."""
        png = _make_minimal_png(640, 480)
        w, h = GalleryManager._png_dimensions(png)
        assert w == 640
        assert h == 480

    def test_returns_zero_on_garbage(self):
        """Should return (0, 0) for non-PNG data."""
        w, h = GalleryManager._png_dimensions(b"not a png")
        assert w == 0
        assert h == 0


class TestMigrationV51:
    """Test schema v51 migration creates the screenshots table."""

    def test_migration_creates_table(self):
        """migrate_to_v51 should create the screenshots table and indexes."""
        from backend.preflight import migrate_to_v51

        con = sqlite3.connect(":memory:")
        # Set up schema_version table with unique constraint (matches real schema)
        con.execute("CREATE TABLE schema_version (version INTEGER UNIQUE)")
        con.execute("INSERT INTO schema_version (version) VALUES (50)")
        con.commit()

        result = migrate_to_v51(con)
        assert result is True

        # Table should exist
        tables = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='screenshots'"
        ).fetchone()
        assert tables is not None

        # Version should be 51
        ver = con.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").fetchone()[0]
        assert ver == 51

        con.close()

    def test_migration_idempotent(self):
        """Running migrate_to_v51 twice should be safe (second call returns False)."""
        from backend.preflight import migrate_to_v51

        con = sqlite3.connect(":memory:")
        con.execute("CREATE TABLE schema_version (version INTEGER UNIQUE)")
        con.execute("INSERT INTO schema_version (version) VALUES (50)")
        con.commit()

        assert migrate_to_v51(con) is True
        assert migrate_to_v51(con) is False

        con.close()
