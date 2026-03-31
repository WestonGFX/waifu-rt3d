"""Intimate Photo Gallery Manager (F42) — CRUD and lifecycle for generated images.

Manages a private, per-character gallery of AI-generated intimate images stored
in the ``intimate_gallery`` SQLite table.  The module provides filtering,
favorites toggling, stats aggregation, content-lock verification, and an
auto-cleanup routine that enforces a configurable per-character image cap.

The engine is stateless — every method accepts an open ``sqlite3.Connection``
so it can be used inside any existing database transaction without assuming
connection ownership.  File-system operations (deletion) are attempted
opportunistically; a missing file on disk does **not** prevent the DB row from
being removed.

Database table (created in the v62 migration)::

    CREATE TABLE intimate_gallery (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id         INTEGER NOT NULL,
        image_path      TEXT    NOT NULL,
        prompt_used     TEXT    NOT NULL DEFAULT '',
        scene_context   TEXT    NOT NULL DEFAULT '',
        mood            TEXT    NOT NULL DEFAULT 'romantic',
        intimacy_level  INTEGER NOT NULL DEFAULT 0,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    DEFAULT (datetime('now'))
    );

Example::

    >>> import sqlite3
    >>> conn = sqlite3.connect(":memory:")
    >>> conn.row_factory = sqlite3.Row
    >>> _ = conn.execute(
    ...     "CREATE TABLE intimate_gallery ("
    ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
    ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
    ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
    ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
    ...     "created_at TEXT DEFAULT (datetime('now')))"
    ... )
    >>> mgr = GalleryManager()
    >>> row = mgr.add_image(1, "/tmp/test.png", "a rose", "evening", "romantic", 3, conn)
    >>> row["image_path"]
    '/tmp/test.png'
    >>> mgr.get_gallery_stats(1, conn)["total"]
    1
"""

from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

#: Default maximum images stored per character before auto-cleanup triggers.
DEFAULT_MAX_IMAGES_PER_CHAR: int = 100

#: Valid mood/category labels accepted by :meth:`GalleryManager.add_image`.
GALLERY_CATEGORIES: list[str] = [
    "romantic",
    "intimate",
    "passionate",
    "artistic",
    "candid",
]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a :class:`sqlite3.Row` to a plain ``dict``.

    Args:
        row: A row returned from a query executed on a connection whose
            ``row_factory`` is ``sqlite3.Row``.

    Returns:
        Plain ``dict`` mapping column names to their values.
    """
    return dict(row)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class GalleryManager:
    """Stateless manager for the intimate_gallery table.

    Every public method accepts an open :class:`sqlite3.Connection` so the
    caller controls transaction boundaries.  The connection's ``row_factory``
    must be set to ``sqlite3.Row`` (or equivalent) before calling query
    methods; :meth:`add_image` sets it automatically on the rows it fetches.

    Example::

        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.row_factory = sqlite3.Row
        >>> _ = conn.execute(
        ...     "CREATE TABLE intimate_gallery ("
        ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
        ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
        ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
        ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
        ...     "created_at TEXT DEFAULT (datetime('now')))"
        ... )
        >>> mgr = GalleryManager()
        >>> mgr.get_gallery(1, conn)
        []
    """

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def add_image(
        self,
        char_id: int,
        image_path: str,
        prompt_used: str,
        scene_context: str,
        mood: str,
        intimacy_level: int,
        conn: sqlite3.Connection,
    ) -> dict:
        """Insert a new image record into the gallery.

        Args:
            char_id: ID of the character this image belongs to.
            image_path: Absolute or relative path to the image file on disk.
            prompt_used: The generation prompt that produced the image.
            scene_context: Short description of the scene/conversation context
                at the time of generation.
            mood: Category label — must be one of :data:`GALLERY_CATEGORIES`.
                Invalid values are stored as-is; callers should validate
                upstream.
            intimacy_level: Numeric intensity of the image (0–10 scale).
            conn: Open SQLite connection with ``row_factory = sqlite3.Row``.

        Returns:
            The newly inserted row as a ``dict``, including the
            auto-assigned ``id`` and ``created_at`` timestamp.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> row = mgr.add_image(1, "/tmp/a.png", "sunset", "beach", "romantic", 2, conn)
            >>> row["char_id"]
            1
            >>> row["mood"]
            'romantic'
        """
        cur = conn.execute(
            """
            INSERT INTO intimate_gallery
                (char_id, image_path, prompt_used, scene_context, mood, intimacy_level)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (char_id, image_path, prompt_used, scene_context, mood, intimacy_level),
        )
        conn.commit()
        new_id = cur.lastrowid

        row = conn.execute(
            "SELECT * FROM intimate_gallery WHERE id = ?", (new_id,)
        ).fetchone()

        logger.debug("gallery: added image id=%d char_id=%d path=%r", new_id, char_id, image_path)
        return _row_to_dict(row)

    def toggle_favorite(self, image_id: int, conn: sqlite3.Connection) -> bool:
        """Flip the ``is_favorite`` flag on an image record.

        Args:
            image_id: Primary key of the gallery row to update.
            conn: Open SQLite connection.

        Returns:
            The **new** value of ``is_favorite`` as a ``bool`` (``True`` if the
            image is now a favorite, ``False`` if it was un-favorited).
            Returns ``False`` if no row with ``image_id`` exists.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> _ = mgr.add_image(1, "/tmp/b.png", "", "", "romantic", 1, conn)
            >>> mgr.toggle_favorite(1, conn)
            True
            >>> mgr.toggle_favorite(1, conn)
            False
        """
        row = conn.execute(
            "SELECT is_favorite FROM intimate_gallery WHERE id = ?", (image_id,)
        ).fetchone()

        if row is None:
            logger.warning("gallery: toggle_favorite called on missing id=%d", image_id)
            return False

        new_value = 0 if row["is_favorite"] else 1
        conn.execute(
            "UPDATE intimate_gallery SET is_favorite = ? WHERE id = ?",
            (new_value, image_id),
        )
        conn.commit()
        logger.debug("gallery: image id=%d is_favorite → %d", image_id, new_value)
        return bool(new_value)

    def delete_image(self, image_id: int, conn: sqlite3.Connection) -> bool:
        """Remove an image record from the DB and attempt to delete it from disk.

        The filesystem deletion is best-effort — if the file does not exist or
        cannot be removed, the DB row is still deleted and ``True`` is returned.
        This prevents orphaned records from accumulating when files are moved
        or deleted externally.

        Args:
            image_id: Primary key of the row to delete.
            conn: Open SQLite connection.

        Returns:
            ``True`` if the row was found and deleted; ``False`` if no row with
            ``image_id`` exists.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> _ = mgr.add_image(1, "/tmp/c.png", "", "", "romantic", 1, conn)
            >>> mgr.delete_image(1, conn)
            True
            >>> mgr.delete_image(999, conn)
            False
        """
        row = conn.execute(
            "SELECT image_path FROM intimate_gallery WHERE id = ?", (image_id,)
        ).fetchone()

        if row is None:
            return False

        image_path: str = row["image_path"]

        # Best-effort filesystem removal.
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
                logger.debug("gallery: removed file %r", image_path)
            except OSError as exc:
                logger.warning("gallery: could not remove file %r: %s", image_path, exc)

        conn.execute("DELETE FROM intimate_gallery WHERE id = ?", (image_id,))
        conn.commit()
        logger.debug("gallery: deleted DB row id=%d", image_id)
        return True

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_gallery(
        self,
        char_id: int,
        conn: sqlite3.Connection,
        category: Optional[str] = None,
        favorites_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """Retrieve gallery images for a character with optional filters.

        Args:
            char_id: ID of the character whose gallery to query.
            conn: Open SQLite connection with ``row_factory = sqlite3.Row``.
            category: When provided, restricts results to rows where
                ``mood = category``.  ``None`` returns all moods.
            favorites_only: When ``True``, only rows with ``is_favorite = 1``
                are returned.
            limit: Maximum number of rows to return (default 50).
            offset: Number of rows to skip for pagination (default 0).

        Returns:
            List of gallery entry dicts ordered newest-first
            (``created_at DESC``).  Empty list when no images match.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> _ = mgr.add_image(1, "/tmp/d.png", "", "", "artistic", 4, conn)
            >>> rows = mgr.get_gallery(1, conn, category="artistic")
            >>> len(rows)
            1
            >>> rows[0]["mood"]
            'artistic'
            >>> mgr.get_gallery(1, conn, favorites_only=True)
            []
        """
        clauses: list[str] = ["char_id = ?"]
        params: list = [char_id]

        if category is not None:
            clauses.append("mood = ?")
            params.append(category)

        if favorites_only:
            clauses.append("is_favorite = 1")

        where = " AND ".join(clauses)
        params.extend([limit, offset])

        rows = conn.execute(
            f"SELECT * FROM intimate_gallery WHERE {where} "
            f"ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params,
        ).fetchall()

        return [_row_to_dict(r) for r in rows]

    def get_gallery_stats(self, char_id: int, conn: sqlite3.Connection) -> dict:
        """Return aggregate statistics for a character's gallery.

        Args:
            char_id: ID of the character to summarise.
            conn: Open SQLite connection with ``row_factory = sqlite3.Row``.

        Returns:
            A ``dict`` with the following keys:

            * ``total`` (int): Total number of images in the gallery.
            * ``favorites`` (int): Number of images marked as favorites.
            * ``by_mood`` (dict[str, int]): Mapping of mood → count for all
              moods that have at least one image.
            * ``oldest`` (str | None): ``created_at`` timestamp of the oldest
              image, or ``None`` if the gallery is empty.
            * ``newest`` (str | None): ``created_at`` timestamp of the newest
              image, or ``None`` if the gallery is empty.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> mgr.get_gallery_stats(1, conn)
            {'total': 0, 'favorites': 0, 'by_mood': {}, 'oldest': None, 'newest': None}
            >>> _ = mgr.add_image(1, "/tmp/e.png", "", "", "candid", 5, conn)
            >>> stats = mgr.get_gallery_stats(1, conn)
            >>> stats["total"]
            1
            >>> stats["by_mood"]
            {'candid': 1}
        """
        totals_row = conn.execute(
            "SELECT COUNT(*) AS total, SUM(is_favorite) AS favorites, "
            "MIN(created_at) AS oldest, MAX(created_at) AS newest "
            "FROM intimate_gallery WHERE char_id = ?",
            (char_id,),
        ).fetchone()

        total = totals_row["total"] or 0
        favorites = int(totals_row["favorites"] or 0)
        oldest = totals_row["oldest"]
        newest = totals_row["newest"]

        mood_rows = conn.execute(
            "SELECT mood, COUNT(*) AS cnt FROM intimate_gallery "
            "WHERE char_id = ? GROUP BY mood",
            (char_id,),
        ).fetchall()

        by_mood: dict[str, int] = {r["mood"]: r["cnt"] for r in mood_rows}

        return {
            "total": total,
            "favorites": favorites,
            "by_mood": by_mood,
            "oldest": oldest,
            "newest": newest,
        }

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def cleanup_old_images(
        self,
        char_id: int,
        max_images: int,
        conn: sqlite3.Connection,
    ) -> int:
        """Delete the oldest non-favorited images when the gallery exceeds cap.

        Favorited images are never removed automatically — they are considered
        explicitly kept by the user.  Only the oldest images (by ``created_at``)
        without a favorite flag are eligible for removal.

        Args:
            char_id: ID of the character whose gallery to trim.
            max_images: Maximum total number of images to keep (including
                favorites).  Defaults to :data:`DEFAULT_MAX_IMAGES_PER_CHAR`
                in caller logic; the method applies whatever value is passed.
            conn: Open SQLite connection.

        Returns:
            Number of images deleted.  Returns ``0`` if the gallery is already
            within the cap or all overflow images are favorited.

        Example::

            >>> import sqlite3
            >>> conn = sqlite3.connect(":memory:")
            >>> conn.row_factory = sqlite3.Row
            >>> _ = conn.execute(
            ...     "CREATE TABLE intimate_gallery ("
            ...     "id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, "
            ...     "image_path TEXT NOT NULL, prompt_used TEXT NOT NULL DEFAULT '', "
            ...     "scene_context TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT 'romantic', "
            ...     "intimacy_level INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, "
            ...     "created_at TEXT DEFAULT (datetime('now')))"
            ... )
            >>> mgr = GalleryManager()
            >>> for i in range(5):
            ...     _ = mgr.add_image(1, f"/tmp/{i}.png", "", "", "romantic", 1, conn)
            >>> mgr.cleanup_old_images(1, max_images=3, conn=conn)
            2
            >>> mgr.get_gallery_stats(1, conn)["total"]
            3
        """
        total_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM intimate_gallery WHERE char_id = ?",
            (char_id,),
        ).fetchone()
        total: int = total_row["cnt"] or 0

        if total <= max_images:
            return 0

        overflow = total - max_images

        # Fetch the oldest non-favorited images up to the overflow count.
        candidates = conn.execute(
            "SELECT id, image_path FROM intimate_gallery "
            "WHERE char_id = ? AND is_favorite = 0 "
            "ORDER BY created_at ASC LIMIT ?",
            (char_id, overflow),
        ).fetchall()

        deleted = 0
        for row in candidates:
            if self.delete_image(row["id"], conn):
                deleted += 1

        logger.debug(
            "gallery: cleanup char_id=%d removed %d/%d overflow images",
            char_id,
            deleted,
            overflow,
        )
        return deleted

    # ------------------------------------------------------------------
    # Content lock
    # ------------------------------------------------------------------

    def verify_content_lock(self, password_hash: str, provided_password: str) -> bool:
        """Verify a plain-text password against a stored SHA-256 hash.

        The content lock is a lightweight password gate that prevents casual
        shoulder-surfing.  It is **not** a security-hardened credential system —
        salting/stretching should be added if threat modelling requires it.

        Args:
            password_hash: Hex-encoded SHA-256 digest of the correct password,
                as stored in the application settings.
            provided_password: The plain-text password entered by the user.

        Returns:
            ``True`` when the SHA-256 digest of ``provided_password`` matches
            ``password_hash``; ``False`` otherwise.

        Example::

            >>> import hashlib
            >>> mgr = GalleryManager()
            >>> h = hashlib.sha256(b"secret").hexdigest()
            >>> mgr.verify_content_lock(h, "secret")
            True
            >>> mgr.verify_content_lock(h, "wrong")
            False
        """
        digest = hashlib.sha256(provided_password.encode()).hexdigest()
        return digest == password_hash
