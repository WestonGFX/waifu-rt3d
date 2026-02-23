"""Easy Diffusion (Easy Stable Diffusion) image generation adapter.

Easy Diffusion is a user-friendly local Stable Diffusion frontend with a
built-in HTTP API server. As of the **beta channel** (v3.x+), it exposes
a full REST API at ``/api/...`` that can be accessed over a local network —
perfect for offloading generation to a second machine on your LAN while the
main app runs on another.

Setting up Easy Diffusion as a network server:
    1. Switch to the **beta channel** in Easy Diffusion settings.
    2. Under ``Settings → Server``, enable ``Allow Network Access``.
    3. Note the LAN IP (e.g. ``http://192.168.1.50:9000``).
    4. Set this URL as ``image_gen.endpoint`` in the waifu-rt3d config.

Beta channel API: ``POST /api/render`` for text-to-image.
Legacy stable channel: ``POST /app/txt2img`` (supported as fallback).

References:
    https://github.com/easydiffusion/easydiffusion/wiki/API
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

from .base import ImageGenAdapter

logger = logging.getLogger("waifu.image_gen.easydiffusion")

# In-memory store for async video jobs (Easy Diffusion has no native async video)
_video_jobs: dict[str, dict] = {}


class EasyDiffusionAdapter(ImageGenAdapter):
    """Image generation via a running Easy Diffusion instance.

    Supports both the **beta channel** API (``/api/render``) and the
    legacy stable channel API (``/app/txt2img``). Beta channel is auto-
    detected and preferred for its richer response format and network access.

    Video generation is not natively supported by Easy Diffusion; calling
    ``generate_video()`` will return an error directing the user to use the
    ComfyUI adapter instead.

    Args:
        images_dir: Directory where generated images are stored.
        config_dir: Path to ``backend/config/`` (unused for Easy Diffusion).
        endpoint: Easy Diffusion base URL (default: ``"http://localhost:9000"``).
        model: Stable Diffusion checkpoint name to use (optional; uses
               whatever is currently loaded in Easy Diffusion if not set).

    Example:
        >>> # Easy Diffusion on a remote machine in the LAN
        >>> adapter = EasyDiffusionAdapter(
        ...     images_dir=Path("backend/storage/images"),
        ...     config_dir=Path("backend/config"),
        ...     endpoint="http://192.168.1.50:9000",
        ... )
        >>> adapter.is_available()
        True
        >>> result = adapter.generate("anime bedroom, cyberpunk", {"width": 512})
        >>> result["url"]
        '/files/images/gen_1708615234_a3f9c12b.png'
    """

    # Task poll interval and max wait for beta-channel async render
    _POLL_INTERVAL_S = 1.5
    _RENDER_TIMEOUT_S = 180

    def __init__(
        self,
        images_dir: Path,
        config_dir: Path,
        endpoint: str = "http://localhost:9000",
        model: str = "",
    ) -> None:
        """
        Args:
            images_dir: Output directory for generated images.
            config_dir: Config directory (unused but kept for interface parity).
            endpoint: Easy Diffusion base URL. Can be a LAN address for
                      offloading to a second machine (e.g. ``http://192.168.1.50:9000``).
            model: Checkpoint to use, or empty string to use currently loaded.
        """
        super().__init__(images_dir, config_dir)
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self._is_beta: Optional[bool] = None  # Lazy-detected on first call

    # ------------------------------------------------------------------ #
    # Internal HTTP helpers
    # ------------------------------------------------------------------ #

    def _post(self, path: str, data: dict, timeout: int = 60) -> Optional[dict]:
        """HTTP POST to the Easy Diffusion API.

        Args:
            path: URL path (e.g. ``"/api/render"``).
            data: JSON body dict.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON dict or ``None`` on error.
        """
        try:
            url = f"{self.endpoint}{path}"
            body = json.dumps(data).encode("utf-8")
            req = Request(url, data=body, headers={"Content-Type": "application/json"})
            with urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"[EasyDiffusion] POST {path} failed: {exc}")
            return None

    def _get(self, path: str, timeout: int = 5) -> Optional[dict]:
        """HTTP GET to the Easy Diffusion API.

        Args:
            path: URL path.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON dict or ``None`` on error.
        """
        try:
            url = f"{self.endpoint}{path}"
            with urlopen(Request(url), timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"[EasyDiffusion] GET {path} failed: {exc}")
            return None

    def _detect_beta(self) -> bool:
        """Auto-detect whether the beta channel API (``/api``) is available.

        The beta channel exposes ``GET /api/system_info`` which the stable
        channel doesn't have. We cache the result so detection only runs once
        per adapter instance.

        Returns:
            ``True`` if beta channel API is present.
        """
        if self._is_beta is not None:
            return self._is_beta
        result = self._get("/api/system_info", timeout=3)
        self._is_beta = result is not None
        logger.debug(f"[EasyDiffusion] Beta channel: {self._is_beta}")
        return self._is_beta

    def _save_image_from_base64(self, b64_data: str, ext: str = "png") -> Optional[str]:
        """Decode a base64 image and save to images_dir.

        Easy Diffusion returns images as base64-encoded strings in both the
        legacy and beta APIs.

        Args:
            b64_data: Base64-encoded image data (with or without data URI prefix).
            ext: File extension for the saved file.

        Returns:
            Saved filename (stem only), or ``None`` on failure.
        """
        import base64
        try:
            # Strip data URI prefix if present: "data:image/png;base64,..."
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            image_bytes = base64.b64decode(b64_data)
            filename = self._mk_name("gen", ext)
            (self.images_dir / filename).write_bytes(image_bytes)
            return filename
        except Exception as exc:
            logger.error(f"[EasyDiffusion] Failed to save base64 image: {exc}")
            return None

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #

    def is_available(self) -> bool:
        """Check whether Easy Diffusion is running and responding.

        Tries the beta API endpoint first (``/api/system_info``), then falls
        back to the legacy ping endpoint (``/ping``).

        Returns:
            ``True`` if Easy Diffusion is reachable.
        """
        if self._get("/api/system_info", timeout=3) is not None:
            return True
        return self._get("/ping", timeout=3) is not None

    def provider_name(self) -> str:
        """Return the provider identifier string.

        Returns:
            ``"easydiffusion"``
        """
        return "easydiffusion"

    def generate(self, prompt: str, cfg: dict) -> dict:
        """Generate an image via Easy Diffusion and save it locally.

        Automatically selects between the beta channel (``/api/render``) and
        the legacy channel (``/app/txt2img``) based on what's available.

        Args:
            prompt: Text prompt for the image.
            cfg: Config dict with optional ``width``, ``height``, ``steps``,
                 ``negative_prompt`` keys.

        Returns:
            ``{"ok": True, "filename": str, "url": str}`` on success, or
            ``{"ok": False, "error": str}`` on failure.
        """
        if self._detect_beta():
            return self._generate_beta(prompt, cfg)
        return self._generate_legacy(prompt, cfg)

    def _generate_beta(self, prompt: str, cfg: dict) -> dict:
        """Generate using the beta channel ``/api/render`` endpoint.

        The beta API returns a task ID; we poll ``/api/render/status/<id>``
        until the result is ready. This matches the pattern used by the
        Easy Diffusion beta channel network server.

        Args:
            prompt: Text prompt for the image.
            cfg: Generation config dict.

        Returns:
            Standard ``{"ok": ..., "filename": ..., "url": ...}`` result dict.
        """
        payload = {
            "prompt": prompt,
            "negative_prompt": cfg.get("negative_prompt", "lowres, blurry, artifacts"),
            "width": int(cfg.get("width", 512)),
            "height": int(cfg.get("height", 512)),
            "num_inference_steps": int(cfg.get("steps", 25)),
            "guidance_scale": float(cfg.get("guidance_scale", 7.5)),
            "num_outputs": 1,
            "output_format": "png",
        }
        if self.model:
            payload["model"] = self.model

        # Submit render task
        task_resp = self._post("/api/render", payload, timeout=10)
        if not task_resp:
            return {"ok": False, "error": "Easy Diffusion (beta) did not accept the request"}

        task_id = task_resp.get("task")
        if not task_id:
            # Some builds return the image directly in the first response
            images = task_resp.get("output", [])
            if images:
                filename = self._save_image_from_base64(images[0].get("data", ""))
                if filename:
                    return {"ok": True, "filename": filename, "url": f"/files/images/{filename}"}
            return {"ok": False, "error": f"Unexpected beta response: {task_resp}"}

        # Poll until done
        deadline = time.time() + self._RENDER_TIMEOUT_S
        while time.time() < deadline:
            status = self._get(f"/api/render/status/{task_id}", timeout=10)
            if not status:
                time.sleep(self._POLL_INTERVAL_S)
                continue

            if status.get("status") == "succeeded":
                images = status.get("output", [])
                if images:
                    filename = self._save_image_from_base64(images[0].get("data", ""))
                    if filename:
                        return {"ok": True, "filename": filename, "url": f"/files/images/{filename}"}
                return {"ok": False, "error": "Render succeeded but no image in output"}

            if status.get("status") == "failed":
                return {"ok": False, "error": status.get("error", "Render failed")}

            time.sleep(self._POLL_INTERVAL_S)

        return {"ok": False, "error": f"Easy Diffusion render timed out ({self._RENDER_TIMEOUT_S}s)"}

    def _generate_legacy(self, prompt: str, cfg: dict) -> dict:
        """Generate using the legacy stable channel ``/app/txt2img`` endpoint.

        The legacy API is synchronous — the POST blocks until the image is
        ready. This is simpler but can time out on slow hardware.

        Args:
            prompt: Text prompt for the image.
            cfg: Generation config dict.

        Returns:
            Standard result dict.
        """
        payload = {
            "prompt": prompt,
            "negative_prompt": cfg.get("negative_prompt", "lowres, blurry"),
            "width": int(cfg.get("width", 512)),
            "height": int(cfg.get("height", 512)),
            "num_inference_steps": int(cfg.get("steps", 25)),
            "guidance_scale": float(cfg.get("guidance_scale", 7.5)),
            "num_outputs": 1,
            "output_format": "png",
            "output_quality": 95,
        }
        if self.model:
            payload["use_stable_diffusion_model"] = self.model

        response = self._post("/app/txt2img", payload, timeout=self._RENDER_TIMEOUT_S)
        if not response:
            return {"ok": False, "error": "Easy Diffusion (legacy) did not respond"}

        output = response.get("output", [])
        if not output:
            return {"ok": False, "error": "Easy Diffusion returned no images"}

        filename = self._save_image_from_base64(output[0].get("data", ""))
        if not filename:
            return {"ok": False, "error": "Failed to decode Easy Diffusion image data"}

        return {"ok": True, "filename": filename, "url": f"/files/images/{filename}"}

    def generate_video(self, prompt: str, cfg: dict) -> dict:
        """Video generation is not supported by Easy Diffusion.

        Easy Diffusion is a Stable Diffusion frontend and does not include
        video generation (Wan 2.2 / AnimateDiff). Use the ComfyUI adapter for
        video generation.

        Args:
            prompt: Unused.
            cfg: Unused.

        Returns:
            ``{"ok": False, "error": "..."}`` always.
        """
        return {
            "ok": False,
            "error": (
                "Easy Diffusion does not support video generation. "
                "Switch to ComfyUI for Wan 2.2 video backgrounds."
            ),
        }

    def video_status(self, job_id: str) -> dict:
        """Always returns an error since Easy Diffusion has no video support.

        Args:
            job_id: Unused.

        Returns:
            ``{"status": "error", ...}`` always.
        """
        return {
            "status": "error",
            "url": None,
            "error": "Video generation not supported by Easy Diffusion adapter.",
        }
