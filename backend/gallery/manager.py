"""Gallery manager — CRUD operations for screenshot storage.

Handles saving screenshots from the Photo Mode / quick-capture flow,
generating thumbnails, and querying the screenshots table (schema v51).

File layout:
    backend/storage/images/screenshots/<uuid>.png   — full-size captures
    backend/storage/images/screenshots/thumbs/<uuid>.png — 300px-wide thumbnails

All public methods accept a sqlite3.Connection so callers control
transaction scope (matches project convention in spectator/memory.py).
"""

import base64
import io
import logging
import os
import sqlite3
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger("waifu")

# Directories are relative to project root (backend/storage/...)
ROOT = Path(__file__).resolve().parents[2]
SCREENSHOTS_DIR = ROOT / "backend" / "storage" / "images" / "screenshots"
THUMBS_DIR = SCREENSHOTS_DIR / "thumbs"

# Thumbnail width in pixels — height scales proportionally
THUMB_WIDTH = 300


@dataclass
class ScreenshotMeta:
    """Metadata for a saved screenshot.

    Attributes:
        id: Database row ID.
        uuid: Unique filename identifier.
        character_id: Associated character (nullable).
        character_name: Character display name at capture time.
        emotion: Expression active during capture.
        gesture: Gesture active during capture.
        quality: Supersampling multiplier (1, 2, or 4).
        transparent: Whether the background was transparent.
        width: Image width in pixels.
        height: Image height in pixels.
        file_size: File size in bytes.
        file_path: Relative path from storage root.
        caption: User-editable caption text.
        favorite: Whether the screenshot is favorited.
        created_at: ISO 8601 timestamp.
    """
    id: int
    uuid: str
    character_id: Optional[int]
    character_name: Optional[str]
    emotion: Optional[str]
    gesture: Optional[str]
    quality: int
    transparent: bool
    width: int
    height: int
    file_size: int
    file_path: str
    caption: str
    favorite: bool
    created_at: str

    def to_dict(self) -> dict:
        """Serialise to JSON-friendly dict with computed URLs.

        Returns:
            Dict with all fields plus ``url`` and ``thumb_url`` for serving.
        """
        d = asdict(self)
        d["transparent"] = bool(d["transparent"])
        d["favorite"] = bool(d["favorite"])
        d["url"] = f"/files/images/screenshots/{self.uuid}.png"
        d["thumb_url"] = f"/files/images/screenshots/thumbs/{self.uuid}.png"
        return d


class GalleryManager:
    """Screenshot gallery CRUD and file management.

    Example:
        >>> mgr = GalleryManager()
        >>> meta = mgr.save(con, data_url="data:image/png;base64,...",
        ...                 character_id=1, character_name="Sakura",
        ...                 emotion="happy", quality=2)
        >>> print(meta.uuid)
        'a1b2c3d4-...'
    """

    def __init__(self) -> None:
        """Ensure screenshot and thumbnail directories exist."""
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        con: sqlite3.Connection,
        data_url: str,
        character_id: Optional[int] = None,
        character_name: Optional[str] = None,
        emotion: Optional[str] = None,
        gesture: Optional[str] = None,
        quality: int = 1,
        transparent: bool = False,
        caption: str = "",
    ) -> ScreenshotMeta:
        """Save a screenshot from a base64 data URL.

        Decodes the image, writes full-size PNG + thumbnail, and inserts
        a row into the screenshots table.

        Args:
            con: Active SQLite connection.
            data_url: PNG data URL (``data:image/png;base64,...``).
            character_id: Character ID at capture time.
            character_name: Character name at capture time.
            emotion: Active emotion/expression.
            gesture: Active gesture.
            quality: Supersampling multiplier (1, 2, or 4).
            transparent: Whether the background was transparent.
            caption: Optional user caption.

        Returns:
            ScreenshotMeta with all fields populated.

        Raises:
            ValueError: If data_url is not a valid base64 PNG data URL.
        """
        # Decode base64 payload
        if "," in data_url:
            raw_b64 = data_url.split(",", 1)[1]
        else:
            raw_b64 = data_url

        try:
            img_bytes = base64.b64decode(raw_b64, validate=True)
        except Exception as exc:
            raise ValueError(f"Invalid base64 data: {exc}") from exc

        file_uuid = uuid.uuid4().hex
        file_name = f"{file_uuid}.png"
        file_path = SCREENSHOTS_DIR / file_name
        thumb_path = THUMBS_DIR / file_name

        # Write full-size PNG
        file_path.write_bytes(img_bytes)
        file_size = len(img_bytes)

        # Read image dimensions and generate thumbnail
        width, height = self._generate_thumbnail(img_bytes, thumb_path)

        # Insert DB row
        cur = con.execute(
            """INSERT INTO screenshots
               (uuid, character_id, character_name, emotion, gesture,
                quality, transparent, width, height, file_size,
                file_path, caption, favorite)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (
                file_uuid, character_id, character_name, emotion, gesture,
                quality, int(transparent), width, height, file_size,
                f"screenshots/{file_name}", caption,
            ),
        )
        con.commit()
        row_id = cur.lastrowid

        # Fetch the complete row to return
        return self._row_to_meta(
            con.execute("SELECT * FROM screenshots WHERE id = ?", (row_id,)).fetchone(),
            con,
        )

    def list(
        self,
        con: sqlite3.Connection,
        character_id: Optional[int] = None,
        favorites_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """List screenshots with pagination and filtering.

        Args:
            con: Active SQLite connection.
            character_id: Filter by character (None = all).
            favorites_only: Only return favorited screenshots.
            limit: Max results per page.
            offset: Pagination offset.

        Returns:
            Dict with ``items`` (list of ScreenshotMeta dicts),
            ``total`` (total matching count), ``limit``, and ``offset``.
        """
        where_clauses = []
        params: list = []

        if character_id is not None:
            where_clauses.append("character_id = ?")
            params.append(character_id)
        if favorites_only:
            where_clauses.append("favorite = 1")

        where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        total = con.execute(
            f"SELECT COUNT(*) FROM screenshots{where_sql}", params
        ).fetchone()[0]

        rows = con.execute(
            f"SELECT * FROM screenshots{where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

        items = [self._row_to_meta(r, con).to_dict() for r in rows]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def get(self, con: sqlite3.Connection, screenshot_id: int) -> Optional[ScreenshotMeta]:
        """Get a single screenshot by ID.

        Args:
            con: Active SQLite connection.
            screenshot_id: Database row ID.

        Returns:
            ScreenshotMeta or None if not found.
        """
        row = con.execute("SELECT * FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
        if not row:
            return None
        return self._row_to_meta(row, con)

    def update(
        self,
        con: sqlite3.Connection,
        screenshot_id: int,
        favorite: Optional[bool] = None,
        caption: Optional[str] = None,
    ) -> Optional[ScreenshotMeta]:
        """Update screenshot metadata (favorite toggle, caption edit).

        Args:
            con: Active SQLite connection.
            screenshot_id: Database row ID.
            favorite: New favorite state (None = no change).
            caption: New caption text (None = no change).

        Returns:
            Updated ScreenshotMeta or None if not found.
        """
        updates = []
        params: list = []
        if favorite is not None:
            updates.append("favorite = ?")
            params.append(int(favorite))
        if caption is not None:
            updates.append("caption = ?")
            params.append(caption)

        if not updates:
            return self.get(con, screenshot_id)

        params.append(screenshot_id)
        con.execute(
            f"UPDATE screenshots SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        con.commit()
        return self.get(con, screenshot_id)

    def delete(self, con: sqlite3.Connection, screenshot_id: int) -> bool:
        """Delete a screenshot — removes DB row, full-size file, and thumbnail.

        Args:
            con: Active SQLite connection.
            screenshot_id: Database row ID.

        Returns:
            True if deleted, False if not found.
        """
        row = con.execute(
            "SELECT uuid FROM screenshots WHERE id = ?", (screenshot_id,)
        ).fetchone()
        if not row:
            return False

        file_uuid = row[0]

        # Remove files (tolerate missing — may have been manually deleted)
        for path in [
            SCREENSHOTS_DIR / f"{file_uuid}.png",
            THUMBS_DIR / f"{file_uuid}.png",
        ]:
            try:
                path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(f"Failed to delete {path}: {exc}")

        con.execute("DELETE FROM screenshots WHERE id = ?", (screenshot_id,))
        con.commit()
        return True

    def get_file_path(self, con: sqlite3.Connection, screenshot_id: int) -> Optional[Path]:
        """Get the full filesystem path for a screenshot's PNG file.

        Args:
            con: Active SQLite connection.
            screenshot_id: Database row ID.

        Returns:
            Path to the PNG file, or None if not found.
        """
        row = con.execute(
            "SELECT uuid FROM screenshots WHERE id = ?", (screenshot_id,)
        ).fetchone()
        if not row:
            return None
        return SCREENSHOTS_DIR / f"{row[0]}.png"

    # ── Private helpers ───────────────────────────────────────────────────

    def _generate_thumbnail(self, img_bytes: bytes, thumb_path: Path) -> tuple[int, int]:
        """Generate a 300px-wide thumbnail and return (width, height) of the original.

        Uses Pillow if available, otherwise saves full image as thumbnail
        (graceful degradation — thumbnails will just be larger).

        Args:
            img_bytes: Raw PNG bytes.
            thumb_path: Where to write the thumbnail.

        Returns:
            Tuple of (original_width, original_height).
        """
        try:
            from PIL import Image

            img = Image.open(io.BytesIO(img_bytes))
            width, height = img.size

            # Generate proportionally scaled thumbnail
            ratio = THUMB_WIDTH / width
            thumb_height = int(height * ratio)
            thumb = img.resize((THUMB_WIDTH, thumb_height), Image.LANCZOS)
            thumb.save(thumb_path, "PNG", optimize=True)

            return width, height

        except ImportError:
            # Pillow not installed — save full image as "thumbnail"
            logger.warning("Pillow not installed — thumbnails will be full-size copies")
            thumb_path.write_bytes(img_bytes)
            # Parse PNG header for dimensions (bytes 16-23 in IHDR chunk)
            return self._png_dimensions(img_bytes)

    @staticmethod
    def _png_dimensions(data: bytes) -> tuple[int, int]:
        """Extract width/height from a PNG file's IHDR chunk.

        Args:
            data: Raw PNG bytes.

        Returns:
            Tuple of (width, height). Returns (0, 0) if parsing fails.
        """
        try:
            # PNG signature (8 bytes) + IHDR length (4) + 'IHDR' (4) = offset 16
            import struct
            w = struct.unpack(">I", data[16:20])[0]
            h = struct.unpack(">I", data[20:24])[0]
            return w, h
        except Exception:
            return 0, 0

    def _row_to_meta(self, row: tuple, con: sqlite3.Connection) -> ScreenshotMeta:
        """Convert a raw SQLite row tuple to ScreenshotMeta.

        Args:
            row: Raw row from ``SELECT * FROM screenshots``.
            con: Active SQLite connection (unused, kept for consistency).

        Returns:
            ScreenshotMeta dataclass.
        """
        return ScreenshotMeta(
            id=row[0],
            uuid=row[1],
            character_id=row[2],
            character_name=row[3],
            emotion=row[4],
            gesture=row[5],
            quality=row[6],
            transparent=bool(row[7]),
            width=row[8],
            height=row[9],
            file_size=row[10],
            file_path=row[11],
            caption=row[12],
            favorite=bool(row[13]),
            created_at=row[14],
        )
