"""Abstract base class for all image/video generation adapters.

Mirrors the TTSAdapter contract so the image generation system is immediately
familiar to anyone who has worked with the TTS layer. Concrete subclasses
must implement ``generate()`` and ``is_available()``.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path


class ImageGenAdapter:
    """Abstract base for image (and async video) generation providers.

    Subclasses must implement:
        - ``generate(prompt, cfg)`` — synchronous image generation
        - ``generate_video(prompt, cfg)`` — kick off async video job
        - ``video_status(job_id)`` — poll async video progress
        - ``is_available()`` — health-check the provider

    All generated images are stored under ``images_dir`` using a
    content-addressed filename derived from the prompt + settings so
    identical requests reuse the same file.

    Args:
        images_dir: Path to ``backend/storage/images/``.
        config_dir: Path to ``backend/config/`` (for workflow templates).

    Example:
        >>> adapter = ComfyUIAdapter(Path("backend/storage/images"), Path("backend/config"))
        >>> if adapter.is_available():
        ...     result = adapter.generate("anime bedroom", {"width": 512, "height": 512})
        ...     print(result["url"])  # /files/images/gen_1708000000_abc.png
    """

    def __init__(self, images_dir: Path, config_dir: Path) -> None:
        """
        Args:
            images_dir: Directory where generated images are saved.
            config_dir: Directory containing workflow JSON templates.
        """
        self.images_dir = images_dir
        self.config_dir = config_dir
        images_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Filename helpers
    # ------------------------------------------------------------------ #

    def _mk_name(self, prefix: str = "gen", ext: str = "png") -> str:
        """Generate a timestamped output filename.

        Args:
            prefix: Filename prefix (e.g. ``"gen"`` or ``"portrait"``).
            ext: File extension without the leading dot.

        Returns:
            Filename like ``"gen_1708615234_a3f9c12b.png"``.
        """
        rnd = hashlib.sha1(str(time.time()).encode()).hexdigest()[:8]
        return f"{prefix}_{int(time.time())}_{rnd}.{ext}"

    # ------------------------------------------------------------------ #
    # Core interface (must implement in subclass)
    # ------------------------------------------------------------------ #

    def generate(self, prompt: str, cfg: dict) -> dict:
        """Generate an image synchronously and save it to ``images_dir``.

        Args:
            prompt: Text prompt describing the desired image.
            cfg: Generation config (``width``, ``height``, ``steps``, ``model``).

        Returns:
            On success: ``{"ok": True, "filename": str, "url": str}``
            On failure: ``{"ok": False, "error": str}``

        Raises:
            NotImplementedError: Must be implemented in subclasses.
        """
        raise NotImplementedError

    def generate_video(self, prompt: str, cfg: dict) -> dict:
        """Start an asynchronous video generation job.

        Video generation takes minutes; this method starts the job and
        returns a ``job_id`` the caller can poll via ``video_status()``.

        Args:
            prompt: Text prompt for the video.
            cfg: Generation config (``duration``, ``fps``, ``model``, etc.).

        Returns:
            On success: ``{"ok": True, "job_id": str}``
            On failure: ``{"ok": False, "error": str}``
        """
        raise NotImplementedError

    def video_status(self, job_id: str) -> dict:
        """Poll the status of an async video generation job.

        Args:
            job_id: Job identifier returned by ``generate_video()``.

        Returns:
            ``{"status": "queued"|"running"|"done"|"error",
               "url": str|None, "progress": float|None, "error": str|None}``
        """
        raise NotImplementedError

    def is_available(self) -> bool:
        """Check whether the generation backend is reachable.

        Returns:
            ``True`` if the backend responds to its health endpoint.
        """
        raise NotImplementedError

    def provider_name(self) -> str:
        """Human-readable provider identifier.

        Returns:
            e.g. ``"comfyui"`` or ``"easydiffusion"``.
        """
        return "unknown"
