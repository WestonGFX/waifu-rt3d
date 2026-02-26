"""TTS Voice Model Manager — download, install, and manage voice packs.

Handles the lifecycle of downloadable TTS voice models (Kokoro .pt files,
Piper .onnx files) with a bundled catalog, HuggingFace downloads, and an
on-disk manifest tracking installed voices.

Example:
    >>> mgr = TTSModelManager()
    >>> catalog = mgr.load_catalog()
    >>> print(len(catalog), "voices in catalog")
    35 voices in catalog
"""

import asyncio
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger("waifu")

# Default storage under backend/storage/tts_models/
_DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[1] / "storage" / "tts_models"
_BUNDLED_CATALOG = Path(__file__).resolve().parent / "voice_catalog.json"

# Common Edge-TTS voices always available (no download needed — cloud streamed)
EDGE_TTS_VOICES: list[dict[str, str]] = [
    {"id": "en-US-AriaNeural", "name": "Aria (Female, American)", "provider": "edge-tts", "language": "en-US", "gender": "female"},
    {"id": "en-US-JennyNeural", "name": "Jenny (Female, American)", "provider": "edge-tts", "language": "en-US", "gender": "female"},
    {"id": "en-US-AmberNeural", "name": "Amber (Female, American)", "provider": "edge-tts", "language": "en-US", "gender": "female"},
    {"id": "en-US-AnaNeural", "name": "Ana (Female, Young)", "provider": "edge-tts", "language": "en-US", "gender": "female"},
    {"id": "en-US-EmmaNeural", "name": "Emma (Female, American)", "provider": "edge-tts", "language": "en-US", "gender": "female"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (Female, British)", "provider": "edge-tts", "language": "en-GB", "gender": "female"},
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Female, Japanese)", "provider": "edge-tts", "language": "ja-JP", "gender": "female"},
    {"id": "es-ES-ElviraNeural", "name": "Elvira (Female, Spanish)", "provider": "edge-tts", "language": "es-ES", "gender": "female"},
    {"id": "fr-FR-DeniseNeural", "name": "Denise (Female, French)", "provider": "edge-tts", "language": "fr-FR", "gender": "female"},
    {"id": "de-DE-KatjaNeural", "name": "Katja (Female, German)", "provider": "edge-tts", "language": "de-DE", "gender": "female"},
]


class TTSModelManager:
    """Manages downloadable TTS voice models with catalog and install tracking.

    Args:
        model_dir: Directory for downloaded voice files. Defaults to
            ``backend/storage/tts_models/``.
        catalog_path: Path to the bundled voice catalog JSON. Defaults to
            ``backend/tts/voice_catalog.json``.

    Attributes:
        model_dir: Resolved Path to the model storage directory.
        catalog_path: Resolved Path to the catalog JSON file.

    Example:
        >>> mgr = TTSModelManager()
        >>> models = mgr.get_models()
        >>> print(models["models"][0]["name"])
        Sky
    """

    def __init__(
        self,
        model_dir: Optional[str | Path] = None,
        catalog_path: Optional[str | Path] = None,
    ):
        self.model_dir = Path(model_dir) if model_dir else _DEFAULT_MODEL_DIR
        self.catalog_path = Path(catalog_path) if catalog_path else _BUNDLED_CATALOG
        self._manifest_path = self.model_dir / ".installed.json"

        # Download state (shared with SSE endpoint)
        self._current_download: dict[str, Any] = {}
        self._download_lock = asyncio.Lock()

        # Ensure storage directories exist
        self.model_dir.mkdir(parents=True, exist_ok=True)
        (self.model_dir / "kokoro").mkdir(exist_ok=True)
        (self.model_dir / "piper").mkdir(exist_ok=True)

    def load_catalog(self) -> list[dict]:
        """Read the bundled voice catalog from disk.

        Returns:
            List of voice entry dicts from ``voice_catalog.json``.

        Raises:
            FileNotFoundError: If the catalog file doesn't exist.

        Example:
            >>> catalog = mgr.load_catalog()
            >>> len(catalog)
            35
        """
        with open(self.catalog_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_installed(self) -> dict[str, dict]:
        """Read the installed models manifest.

        Returns:
            Dict mapping model IDs to their install metadata
            (``installed_at``, ``size_bytes``, ``version``).

        Example:
            >>> installed = mgr.get_installed()
            >>> "kokoro/af_sky" in installed
            True
        """
        if not self._manifest_path.exists():
            return {}
        try:
            with open(self._manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"[TTS ModelManager] Failed to read manifest: {e}")
            return {}

    def _save_manifest(self, manifest: dict[str, dict]) -> None:
        """Persist the installed models manifest to disk.

        Args:
            manifest: The full manifest dict to write.
        """
        with open(self._manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

    def get_models(self) -> dict:
        """Return the full catalog merged with install status.

        Returns:
            ``{"models": [...], "catalog_updated": str, "total_installed_mb": float}``
            where each model entry includes an ``installed`` boolean.

        Example:
            >>> data = mgr.get_models()
            >>> data["models"][0]["installed"]
            False
        """
        catalog = self.load_catalog()
        installed = self.get_installed()

        total_installed_bytes = 0
        for entry in catalog:
            mid = entry["id"]
            entry["installed"] = mid in installed
            if entry["installed"]:
                total_installed_bytes += installed[mid].get("size_bytes", 0)

        # Catalog timestamp: use file mtime
        try:
            mtime = os.path.getmtime(self.catalog_path)
            catalog_updated = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except OSError:
            catalog_updated = None

        return {
            "models": catalog,
            "catalog_updated": catalog_updated,
            "total_installed_mb": round(total_installed_bytes / (1024 * 1024), 2),
        }

    def get_voices(self, provider: Optional[str] = None) -> dict:
        """Return installed voices for the voice picker dropdown.

        Merges installed Kokoro/Piper voices with always-available Edge-TTS
        voices. Optionally filtered by provider.

        Args:
            provider: Filter to a specific provider (``"kokoro"``,
                ``"piper"``, ``"edge-tts"``). ``None`` returns all.

        Returns:
            ``{"voices": [{"id": str, "name": str, "provider": str, "language": str}, ...]}``

        Example:
            >>> data = mgr.get_voices(provider="edge-tts")
            >>> len(data["voices"]) > 0
            True
        """
        voices: list[dict] = []
        installed = self.get_installed()
        catalog = self.load_catalog()

        # Add installed local voices from catalog
        for entry in catalog:
            if entry["id"] not in installed:
                continue
            engine = entry["engine"]
            if provider and engine != provider:
                continue
            voices.append({
                "id": entry["voice_id"],
                "name": f"{entry['name']} ({entry['gender'].title()}, {entry['language']})",
                "provider": entry["engine"],
                "language": entry["language"],
                "gender": entry["gender"],
            })

        # Add Edge-TTS voices (always available, no download needed)
        if not provider or provider == "edge-tts":
            voices.extend(EDGE_TTS_VOICES)

        return {"voices": voices}

    async def install_model(
        self,
        model_id: str,
        progress_cb: Optional[Callable] = None,
    ) -> dict:
        """Download and install a voice model from the catalog.

        Downloads all files listed in the catalog entry for ``model_id``
        using async httpx streaming. Updates the install manifest on success.
        Only one download runs at a time (protected by ``_download_lock``).

        Args:
            model_id: Catalog entry ID (e.g. ``"kokoro/af_sky"``).
            progress_cb: Optional callback ``(progress_dict) -> None``.

        Returns:
            ``{"ok": True, "model_id": str, "size_bytes": int}`` on success,
            or ``{"ok": False, "error": str}`` on failure.

        Raises:
            None — errors are returned in the dict, not raised.

        Example:
            >>> result = await mgr.install_model("kokoro/af_sky")
            >>> result["ok"]
            True
        """
        # Find catalog entry
        catalog = self.load_catalog()
        entry = next((e for e in catalog if e["id"] == model_id), None)
        if not entry:
            return {"ok": False, "error": f"Model '{model_id}' not found in catalog"}

        # Check if already installed
        installed = self.get_installed()
        if model_id in installed:
            return {"ok": False, "error": f"Model '{model_id}' is already installed"}

        # Acquire download lock (one download at a time)
        if self._download_lock.locked():
            return {"ok": False, "error": "Another download is in progress"}

        async with self._download_lock:
            self._current_download = {
                "model_id": model_id,
                "status": "downloading",
                "progress": 0.0,
                "bytes_done": 0,
                "bytes_total": 0,
                "file_index": 0,
                "file_count": len(entry["files"]),
            }

            total_bytes = 0
            try:
                import httpx

                async with httpx.AsyncClient(follow_redirects=True, timeout=300) as client:
                    for i, file_info in enumerate(entry["files"]):
                        url = file_info["url"]
                        dest = self.model_dir / file_info["path"]
                        dest.parent.mkdir(parents=True, exist_ok=True)

                        self._current_download["file_index"] = i
                        self._current_download["status"] = "downloading"

                        # Stream download with progress
                        async with client.stream("GET", url) as resp:
                            if resp.status_code != 200:
                                raise Exception(f"HTTP {resp.status_code} for {url}")

                            file_total = int(resp.headers.get("content-length", 0))
                            self._current_download["bytes_total"] += file_total
                            file_bytes = 0

                            with open(dest, "wb") as f:
                                async for chunk in resp.aiter_bytes(chunk_size=65536):
                                    f.write(chunk)
                                    file_bytes += len(chunk)
                                    total_bytes += len(chunk)
                                    self._current_download["bytes_done"] = total_bytes
                                    if self._current_download["bytes_total"] > 0:
                                        self._current_download["progress"] = round(
                                            total_bytes / self._current_download["bytes_total"], 3
                                        )

                # Update manifest
                installed[model_id] = {
                    "installed_at": datetime.now(tz=timezone.utc).isoformat(),
                    "size_bytes": total_bytes,
                    "version": "1.0",
                }
                self._save_manifest(installed)

                self._current_download = {
                    "model_id": model_id,
                    "status": "complete",
                    "progress": 1.0,
                    "bytes_done": total_bytes,
                    "bytes_total": total_bytes,
                }
                logger.info(f"[TTS ModelManager] Installed {model_id} ({total_bytes} bytes)")
                return {"ok": True, "model_id": model_id, "size_bytes": total_bytes}

            except Exception as e:
                # Clean up partial downloads
                for file_info in entry["files"]:
                    partial = self.model_dir / file_info["path"]
                    if partial.exists():
                        partial.unlink(missing_ok=True)

                self._current_download = {
                    "model_id": model_id,
                    "status": "error",
                    "error": str(e),
                    "progress": 0,
                }
                logger.error(f"[TTS ModelManager] Install failed for {model_id}: {e}")
                return {"ok": False, "error": str(e)}

    def delete_model(self, model_id: str) -> dict:
        """Delete an installed voice model and remove it from the manifest.

        Args:
            model_id: The model ID to delete (e.g. ``"kokoro/af_sky"``).

        Returns:
            ``{"ok": True, "model_id": str}`` on success,
            or ``{"ok": False, "error": str}`` if not installed.

        Example:
            >>> mgr.delete_model("kokoro/af_sky")
            {"ok": True, "model_id": "kokoro/af_sky"}
        """
        installed = self.get_installed()
        if model_id not in installed:
            return {"ok": False, "error": f"Model '{model_id}' is not installed"}

        # Find catalog entry for file paths
        catalog = self.load_catalog()
        entry = next((e for e in catalog if e["id"] == model_id), None)

        if entry:
            for file_info in entry["files"]:
                fpath = self.model_dir / file_info["path"]
                if fpath.exists():
                    fpath.unlink(missing_ok=True)
                    logger.debug(f"[TTS ModelManager] Deleted {fpath}")

        # Update manifest
        del installed[model_id]
        self._save_manifest(installed)
        logger.info(f"[TTS ModelManager] Deleted model {model_id}")
        return {"ok": True, "model_id": model_id}

    async def refresh_catalog(self, catalog_url: Optional[str] = None) -> dict:
        """Fetch an updated voice catalog from a remote URL.

        Downloads the remote JSON catalog and overwrites the bundled one.
        Falls back gracefully if the fetch fails.

        Args:
            catalog_url: URL to fetch the updated catalog from.
                ``None`` returns an error (no URL configured).

        Returns:
            ``{"ok": True, "count": int}`` on success,
            or ``{"ok": False, "error": str}`` on failure.

        Example:
            >>> result = await mgr.refresh_catalog("https://example.com/catalog.json")
            >>> result["ok"]
            True
        """
        if not catalog_url:
            return {"ok": False, "error": "No catalog URL configured"}

        try:
            import httpx

            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                resp = await client.get(catalog_url)
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}")

                new_catalog = resp.json()
                if not isinstance(new_catalog, list):
                    raise Exception("Invalid catalog format (expected JSON array)")

                # Validate entries have required fields
                required = {"id", "engine", "name", "files"}
                for entry in new_catalog:
                    missing = required - set(entry.keys())
                    if missing:
                        raise Exception(f"Entry missing fields: {missing}")

                # Write updated catalog
                with open(self.catalog_path, "w", encoding="utf-8") as f:
                    json.dump(new_catalog, f, indent=2)

                logger.info(f"[TTS ModelManager] Catalog refreshed: {len(new_catalog)} voices")
                return {"ok": True, "count": len(new_catalog)}

        except Exception as e:
            logger.warning(f"[TTS ModelManager] Catalog refresh failed: {e}")
            return {"ok": False, "error": str(e)}

    def get_download_status(self) -> dict:
        """Return the current download progress state.

        Returns:
            The ``_current_download`` dict with keys: ``model_id``,
            ``status``, ``progress``, ``bytes_done``, ``bytes_total``.
            Empty dict if no download is active or recent.
        """
        return dict(self._current_download)
