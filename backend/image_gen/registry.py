"""Image/video generation adapter factory.

Mirrors the ``backend/llm/registry.py`` pattern: reads ``image_gen.provider``
from the app config and returns the appropriate ``ImageGenAdapter`` subclass.

Usage:
    from backend.image_gen.registry import get_image_gen
    from backend.server import load_config

    adapter = get_image_gen(load_config())
    if adapter.is_available():
        result = adapter.generate("anime bedroom", {"width": 512})
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path

from .adapters.base import ImageGenAdapter
from .adapters.comfyui import ComfyUIAdapter
from .adapters.easydiffusion import EasyDiffusionAdapter

logger = logging.getLogger("waifu.image_gen.registry")

# Paths are resolved relative to the project root (two levels up from this file)
_ROOT = Path(__file__).resolve().parents[2]
_IMAGES_DIR = _ROOT / "backend" / "storage" / "images"
_CONFIG_DIR = _ROOT / "backend" / "config"
_DEFAULT_COMFYUI_ENDPOINT = os.environ.get("WAIFU_COMFYUI_ENDPOINT", "http://localhost:8188")


class _DisabledAdapter(ImageGenAdapter):
    """Null adapter returned when image generation is set to 'disabled'.

    All methods return failure responses so callers can branch on ``ok``
    without having to check for ``None``.
    """

    def is_available(self) -> bool:
        return False

    def provider_name(self) -> str:
        return "disabled"

    def generate(self, prompt: str, cfg: dict) -> dict:
        return {"ok": False, "error": "Image generation is disabled in settings"}

    def generate_video(self, prompt: str, cfg: dict) -> dict:
        return {"ok": False, "error": "Video generation is disabled in settings"}

    def video_status(self, job_id: str) -> dict:
        return {"status": "error", "url": None, "error": "Video generation is disabled"}


def get_image_gen(cfg: dict) -> ImageGenAdapter:
    """Return the active image generation adapter based on app config.

    Reads ``cfg["image_gen"]["provider"]`` (or the flat legacy key
    ``cfg["image_gen_provider"]``) and returns the matching adapter.

    Supported providers:
        ``"comfyui"``       — ComfyUI local/remote (default)
        ``"easydiffusion"`` — Easy Diffusion local/LAN server
        ``"disabled"``      — No-op adapter (generation hidden in UI)

    Args:
        cfg: Full application config dict from ``load_config()``.

    Returns:
        An ``ImageGenAdapter`` subclass instance ready to use.

    Example:
        >>> adapter = get_image_gen({"image_gen": {"provider": "comfyui",
        ...                                         "endpoint": "http://localhost:8188"}})
        >>> adapter.provider_name()
        'comfyui'
    """
    image_cfg = cfg.get("image_gen", {})
    provider = image_cfg.get("provider", "disabled").lower()
    endpoint = image_cfg.get("endpoint", _DEFAULT_COMFYUI_ENDPOINT)
    model = image_cfg.get("model", "")

    if provider == "comfyui":
        logger.debug(f"[ImageGen] Using ComfyUI adapter at {endpoint}")
        return ComfyUIAdapter(
            images_dir=_IMAGES_DIR,
            config_dir=_CONFIG_DIR,
            endpoint=endpoint,
            model=model,
        )

    if provider == "easydiffusion":
        logger.debug(f"[ImageGen] Using Easy Diffusion adapter at {endpoint}")
        return EasyDiffusionAdapter(
            images_dir=_IMAGES_DIR,
            config_dir=_CONFIG_DIR,
            endpoint=endpoint,
            model=model,
        )

    # "disabled" or unrecognised provider
    if provider != "disabled":
        logger.warning(f"[ImageGen] Unknown provider '{provider}', using disabled adapter")
    return _DisabledAdapter(_IMAGES_DIR, _CONFIG_DIR)


def resolve_character_style(
    char_id: int | None, db_path: str
) -> tuple[str, str]:
    """Load a character's ``image_style`` JSON and return prompt prefix strings.

    Reads the schema-v71 ``characters.image_style`` column and parses it as
    JSON of the form ``{"positive": str, "negative": str, "lora"?: str}``.
    Returns the ``positive`` and ``negative`` strings so callers can build
    style-aware generation prompts without changing call signatures::

        pos, neg = resolve_character_style(char_id, str(DB_PATH))
        full_prompt = f"{pos}, {user_prompt}" if pos else user_prompt

    The function is intentionally fail-soft: any error path (no char_id,
    NULL row, missing column, malformed JSON, missing DB file) returns
    ``("", "")`` so callers can blindly prepend without an extra guard.

    The connection is opened in read-only URI mode and closed before
    returning — no pool participation, no write lock contention. This
    helper is a utility (not a request handler), so a short-lived raw
    connection is appropriate per project conventions.

    Args:
        char_id: Database ID of the active character, or ``None``.
        db_path: Absolute path to the SQLite application database file.

    Returns:
        Tuple of ``(positive_prefix, negative_prefix)``. Both are empty
        strings when ``char_id`` is ``None``, the row is missing, the
        column is NULL, or the JSON cannot be parsed.

    Example:
        >>> pos, neg = resolve_character_style(1, "/path/to/app.db")
        >>> full_prompt = f"{pos}, selfie" if pos else "selfie"
    """
    if char_id is None:
        return "", ""
    if not db_path:
        return "", ""

    con: sqlite3.Connection | None = None
    try:
        # Read-only URI mode — short-lived helper, no write lock acquired.
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        row = con.execute(
            "SELECT image_style FROM characters WHERE id = ?", (int(char_id),)
        ).fetchone()
    except sqlite3.Error as e:
        logger.debug("[ImageGen] resolve_character_style read failed: %s", e)
        return "", ""
    finally:
        if con is not None:
            con.close()

    if row is None or row[0] is None:
        return "", ""

    try:
        data = json.loads(row[0])
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(
            "[ImageGen] image_style JSON parse failed for char_id=%s: %s",
            char_id,
            e,
        )
        return "", ""

    if not isinstance(data, dict):
        return "", ""

    positive = data.get("positive") or ""
    negative = data.get("negative") or ""
    return (positive if isinstance(positive, str) else "",
            negative if isinstance(negative, str) else "")


def get_video_gen(cfg: dict) -> ImageGenAdapter:
    """Return the active video generation adapter based on app config.

    Reads ``cfg["video_gen"]["provider"]``. Currently only ``"comfyui"``
    supports video; Easy Diffusion will return an error on video calls.

    Args:
        cfg: Full application config dict.

    Returns:
        An ``ImageGenAdapter`` instance whose ``generate_video()`` method
        can be called for async video generation.

    Example:
        >>> adapter = get_video_gen({"video_gen": {"provider": "comfyui",
        ...                                         "endpoint": "http://localhost:8188"}})
        >>> adapter.provider_name()
        'comfyui'
    """
    video_cfg = cfg.get("video_gen", {})
    provider = video_cfg.get("provider", "disabled").lower()
    endpoint = video_cfg.get("endpoint", _DEFAULT_COMFYUI_ENDPOINT)
    model = video_cfg.get("model", "wan2.2-ti2v-5b")

    if provider == "comfyui":
        return ComfyUIAdapter(
            images_dir=_IMAGES_DIR,
            config_dir=_CONFIG_DIR,
            endpoint=endpoint,
            model=model,
        )

    if provider == "wan2gp":
        # wan2gp is a standalone gradio UI for Wan 2.2 — currently falls back
        # to ComfyUI adapter since they share the same job-queue pattern.
        # Future: implement a dedicated Wan2GPAdapter.
        logger.info("[VideoGen] wan2gp provider maps to ComfyUI adapter (same REST pattern)")
        return ComfyUIAdapter(
            images_dir=_IMAGES_DIR,
            config_dir=_CONFIG_DIR,
            endpoint=endpoint,
            model=model,
        )

    return _DisabledAdapter(_IMAGES_DIR, _CONFIG_DIR)
