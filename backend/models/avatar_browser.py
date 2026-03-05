"""Browse, search, and download 3D avatar models from external sources.

Sources:
    - CC0 curated catalog (bundled JSON, no auth)
    - Sketchfab API (token auth, CC-licensed GLB)
    - VRoid Hub (OAuth 2.0, VRM) — Phase 2 stub

The download engine uses httpx for streaming with progress tracking,
enabling the frontend to poll download status without WebSockets.

Example:
    >>> browser = AvatarBrowser()
    >>> results = browser.search_cc0("anime")
    >>> for model in results:
    ...     print(model["name"], model["format"])
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Paths
_THIS_DIR = Path(__file__).resolve().parent.parent
_CATALOG_PATH = _THIS_DIR / "data" / "cc0_models.json"
_AVATARS_DIR = _THIS_DIR / "storage" / "avatars"
_MODELS_DIR = _THIS_DIR / "storage" / "models"

# Format → subdirectory mapping for organized storage
_FORMAT_DIRS: dict[str, str] = {
    "vrm": "vrm",
    "glb": "glb",
    "gltf": "glb",
    "pmx": "mmd",
    "pmd": "mmd",
}

# Supported model file extensions
_MODEL_EXTENSIONS = {".vrm", ".glb", ".gltf", ".pmx", ".pmd"}


class AvatarBrowser:
    """Browse, search, and download 3D avatar models from external sources.

    Attributes:
        catalog: Loaded CC0 model catalog (list of dicts).
        download_progress: Current download state for progress polling.

    Example:
        >>> browser = AvatarBrowser()
        >>> catalog = browser.get_cc0_catalog()
        >>> len(catalog) > 0
        True
    """

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        """Initialize the avatar browser.

        Args:
            config: Optional app config dict. Used to read
                ``config.system.sketchfab_token`` for Sketchfab API auth.
        """
        self.config = config or {}
        self.catalog: list[dict[str, Any]] = []
        self.download_progress: dict[str, Any] = {
            "active": False,
            "filename": None,
            "progress_pct": 0,
            "speed_mb_s": 0,
            "error": None,
        }
        self._load_catalog()

    def _load_catalog(self) -> None:
        """Load the bundled CC0 model catalog from disk."""
        if _CATALOG_PATH.exists():
            try:
                with open(_CATALOG_PATH, "r", encoding="utf-8") as f:
                    self.catalog = json.load(f)
                logger.info(f"Loaded CC0 catalog: {len(self.catalog)} models")
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load CC0 catalog: {e}")
                self.catalog = []
        else:
            logger.info("No CC0 catalog found at %s", _CATALOG_PATH)
            self.catalog = []

    # ── CC0 Catalog Methods ──────────────────────────────────────────────

    def get_cc0_catalog(self) -> list[dict[str, Any]]:
        """Return the full CC0 curated catalog.

        Returns:
            List of model dicts with keys: id, name, description,
            thumbnail_url, download_url, format, license, file_size_mb,
            tags, author, author_url.

        Example:
            >>> browser = AvatarBrowser()
            >>> models = browser.get_cc0_catalog()
            >>> all("name" in m for m in models)
            True
        """
        return self.catalog

    def search_cc0(self, query: str) -> list[dict[str, Any]]:
        """Search the CC0 catalog by name, tags, or description.

        Args:
            query: Search string (case-insensitive). Matches against
                name, description, tags, and author fields.

        Returns:
            Filtered list of matching model dicts, sorted by relevance
            (name matches first, then description/tag matches).

        Example:
            >>> browser = AvatarBrowser()
            >>> results = browser.search_cc0("anime")
            >>> all("anime" in str(r).lower() for r in results)
            True
        """
        q = query.lower().strip()
        if not q:
            return self.catalog

        scored: list[tuple[int, dict[str, Any]]] = []
        for model in self.catalog:
            score = 0
            if q in model.get("name", "").lower():
                score += 3
            if q in model.get("description", "").lower():
                score += 1
            tags = model.get("tags", [])
            if any(q in t.lower() for t in tags):
                score += 2
            if q in model.get("author", "").lower():
                score += 1
            if score > 0:
                scored.append((score, model))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [m for _, m in scored]

    # ── Sketchfab Methods ────────────────────────────────────────────────

    def _get_sketchfab_token(self) -> str | None:
        """Get the Sketchfab API token from config."""
        system = self.config.get("system", {})
        if isinstance(system, dict):
            return system.get("sketchfab_token")
        return None

    async def search_sketchfab(
        self, query: str, page: int = 1
    ) -> list[dict[str, Any]]:
        """Search Sketchfab for downloadable CC-licensed 3D models.

        Args:
            query: Search string for model name/description.
            page: Pagination page number (1-based, 24 results per page).

        Returns:
            List of model dicts normalized to the BrowseableModel shape.
            Empty list if no API token is configured or request fails.

        Example:
            >>> browser = AvatarBrowser({"system": {"sketchfab_token": "abc"}})
            >>> # results = await browser.search_sketchfab("anime girl")
        """
        token = self._get_sketchfab_token()
        if not token:
            return []

        url = "https://api.sketchfab.com/v3/search"
        params = {
            "type": "models",
            "downloadable": "true",
            "q": query,
            "license": "by,cc0",
            "count": 24,
            "cursor": (page - 1) * 24,
        }
        headers = {"Authorization": f"Token {token}"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            results = []
            for item in data.get("results", []):
                thumb = ""
                images = item.get("thumbnails", {}).get("images", [])
                if images:
                    # Pick the 200px thumbnail
                    for img in images:
                        if img.get("width", 0) == 200:
                            thumb = img.get("url", "")
                            break
                    if not thumb:
                        thumb = images[0].get("url", "")

                results.append({
                    "id": f"sf_{item['uid']}",
                    "name": item.get("name", "Untitled"),
                    "description": item.get("description", "")[:200],
                    "thumbnail_url": thumb,
                    "download_url": "",  # Requires separate download URL fetch
                    "format": "glb",
                    "license": item.get("license", {}).get("slug", "unknown"),
                    "file_size_mb": 0,
                    "tags": [t.get("name", "") for t in item.get("tags", [])[:5]],
                    "author": item.get("user", {}).get("displayName", ""),
                    "author_url": item.get("user", {}).get("profileUrl", ""),
                    "source": "sketchfab",
                    "_uid": item["uid"],
                })
            return results

        except httpx.HTTPError as e:
            logger.error(f"Sketchfab search failed: {e}")
            return []

    async def get_sketchfab_download_url(self, uid: str) -> str | None:
        """Get a temporary download URL for a Sketchfab model.

        Args:
            uid: Sketchfab model UID.

        Returns:
            Temporary download URL string, or None on failure.
        """
        token = self._get_sketchfab_token()
        if not token:
            return None

        url = f"https://api.sketchfab.com/v3/models/{uid}/download"
        headers = {"Authorization": f"Token {token}"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            return data.get("glb", {}).get("url") or data.get("gltf", {}).get("url")
        except httpx.HTTPError as e:
            logger.error(f"Sketchfab download URL fetch failed: {e}")
            return None

    # ── Download Engine ──────────────────────────────────────────────────

    def _target_dir_for_file(self, filename: str) -> Path:
        """Determine the correct storage directory for a model file.

        Routes files to organized ``models/{format}/`` subdirectories based
        on file extension. Falls back to the legacy ``avatars/`` directory
        for unknown extensions.

        Args:
            filename: The model filename (e.g., "anime_girl.vrm").

        Returns:
            Path to the target directory.
        """
        ext = Path(filename).suffix.lstrip(".").lower()
        subdir = _FORMAT_DIRS.get(ext)
        if subdir:
            target = _MODELS_DIR / subdir
        else:
            target = _AVATARS_DIR
        target.mkdir(parents=True, exist_ok=True)
        return target

    async def download_model(
        self, url: str, filename: str, source: str = "cc0"
    ) -> dict[str, Any]:
        """Download a 3D model file with progress tracking.

        Streams the file from the given URL and saves it to the appropriate
        ``models/{format}/`` subdirectory. Progress is tracked in
        ``self.download_progress``.

        Args:
            url: Direct download URL for the model file.
            filename: Target filename (e.g., "anime_girl.vrm").
            source: Source identifier for logging ("cc0", "sketchfab").

        Returns:
            Dict with keys: ok (bool), filename (str), path (str),
            error (str | None).

        Example:
            >>> browser = AvatarBrowser()
            >>> # result = await browser.download_model(url, "model.vrm")
        """
        target_dir = self._target_dir_for_file(filename)
        target_path = target_dir / filename

        self.download_progress = {
            "active": True,
            "filename": filename,
            "progress_pct": 0,
            "speed_mb_s": 0,
            "error": None,
        }

        try:
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("content-length", 0))
                    downloaded = 0
                    start_time = time.monotonic()

                    with open(target_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            elapsed = time.monotonic() - start_time
                            speed = (downloaded / (1024 * 1024)) / max(elapsed, 0.01)
                            pct = (downloaded / total * 100) if total > 0 else 0

                            self.download_progress.update({
                                "progress_pct": round(pct, 1),
                                "speed_mb_s": round(speed, 2),
                            })

            self.download_progress["active"] = False
            self.download_progress["progress_pct"] = 100
            logger.info(f"Downloaded {filename} from {source} ({downloaded} bytes)")
            return {"ok": True, "filename": filename, "path": str(target_path), "error": None}

        except Exception as e:
            self.download_progress["active"] = False
            self.download_progress["error"] = str(e)
            logger.error(f"Download failed for {filename}: {e}")
            # Clean up partial file
            if target_path.exists():
                target_path.unlink(missing_ok=True)
            return {"ok": False, "filename": filename, "path": "", "error": str(e)}

    def get_download_progress(self) -> dict[str, Any]:
        """Get the current download progress state.

        Returns:
            Dict with: active (bool), filename, progress_pct,
            speed_mb_s, error.
        """
        return dict(self.download_progress)

    # ── Local Management ─────────────────────────────────────────────────

    def list_local_models(self) -> list[dict[str, Any]]:
        """List all locally stored avatar model files.

        Scans both the legacy ``avatars/`` directory and the new organized
        ``models/{vrm,glb,mmd}/`` subdirectories, deduplicating by filename.

        Returns:
            List of dicts with: filename, path, format, size_mb, source_dir.

        Example:
            >>> browser = AvatarBrowser()
            >>> models = browser.list_local_models()
            >>> all("filename" in m for m in models)
            True
        """
        seen: set[str] = set()
        models: list[dict[str, Any]] = []

        # Scan organized models/ subdirectories first (preferred)
        if _MODELS_DIR.exists():
            for subdir in sorted(_MODELS_DIR.iterdir()):
                if not subdir.is_dir():
                    continue
                for f in sorted(subdir.iterdir()):
                    if f.suffix.lower() in _MODEL_EXTENSIONS and f.name not in seen:
                        seen.add(f.name)
                        models.append({
                            "filename": f.name,
                            "path": str(f),
                            "format": f.suffix.lstrip(".").lower(),
                            "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                            "source_dir": subdir.name,
                        })

        # Scan legacy avatars/ directory (backwards compat)
        if _AVATARS_DIR.exists():
            for f in sorted(_AVATARS_DIR.iterdir()):
                if f.suffix.lower() in _MODEL_EXTENSIONS and f.name not in seen:
                    seen.add(f.name)
                    models.append({
                        "filename": f.name,
                        "path": str(f),
                        "format": f.suffix.lstrip(".").lower(),
                        "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                        "source_dir": "avatars",
                    })

        return models

    def _find_model_path(self, filename: str) -> Path | None:
        """Find a model file across all storage directories.

        Searches ``models/`` subdirectories first, then falls back to
        the legacy ``avatars/`` directory.

        Args:
            filename: Name of the model file to find.

        Returns:
            Path to the file if found, None otherwise.
        """
        # Check organized models/ subdirs first
        if _MODELS_DIR.exists():
            for subdir in _MODELS_DIR.iterdir():
                candidate = subdir / filename
                if candidate.exists():
                    return candidate

        # Fall back to legacy avatars/
        candidate = _AVATARS_DIR / filename
        if candidate.exists():
            return candidate

        return None

    def rename_model(self, old_name: str, new_name: str) -> dict[str, Any]:
        """Rename a local avatar model file.

        Args:
            old_name: Current filename.
            new_name: New filename (must preserve extension).

        Returns:
            Dict with: ok (bool), error (str | None).
        """
        old_path = self._find_model_path(old_name)
        if not old_path:
            return {"ok": False, "error": f"File not found: {old_name}"}

        new_path = old_path.parent / new_name
        if new_path.exists():
            return {"ok": False, "error": f"File already exists: {new_name}"}

        try:
            old_path.rename(new_path)
            logger.info(f"Renamed avatar: {old_name} → {new_name}")
            return {"ok": True, "error": None}
        except OSError as e:
            return {"ok": False, "error": str(e)}

    def delete_model(self, filename: str) -> dict[str, Any]:
        """Delete a local avatar model file.

        Args:
            filename: Name of the file to delete.

        Returns:
            Dict with: ok (bool), error (str | None).
        """
        path = self._find_model_path(filename)
        if not path:
            return {"ok": False, "error": f"File not found: {filename}"}

        try:
            path.unlink()
            logger.info(f"Deleted avatar: {filename}")
            return {"ok": True, "error": None}
        except OSError as e:
            return {"ok": False, "error": str(e)}

    def get_model_metadata(self, filename: str) -> dict[str, Any]:
        """Get metadata about a local avatar model.

        Args:
            filename: Name of the model file.

        Returns:
            Dict with: filename, path, format, size_mb, modified_at.
        """
        path = self._find_model_path(filename)
        if not path:
            return {"error": f"File not found: {filename}"}

        stat = path.stat()
        return {
            "filename": path.name,
            "path": str(path),
            "format": path.suffix.lstrip(".").lower(),
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "modified_at": stat.st_mtime,
        }
