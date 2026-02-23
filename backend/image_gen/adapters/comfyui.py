"""ComfyUI image and video generation adapter.

Uses the ComfyUI REST API (port 8188 by default) + WebSocket for job
completion tracking. This is the primary recommended adapter for local
generation on machines with dedicated GPUs.

Workflow:
    1. Load a workflow JSON template from ``backend/config/``.
    2. Inject the user's prompt into the CLIPTextEncode node.
    3. POST to ``/prompt`` to queue the generation.
    4. Poll ``/history/{prompt_id}`` until the job completes.
    5. Copy the output image to ``images_dir`` with a stable filename.

ComfyUI must be running at the configured endpoint (default:
``http://localhost:8188``) with the specified checkpoint loaded.

References:
    https://github.com/comfyanonymous/ComfyUI/blob/master/server.py
"""

from __future__ import annotations

import json
import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError

from .base import ImageGenAdapter

logger = logging.getLogger("waifu.image_gen.comfyui")

# Node IDs in the default workflow templates that receive the text prompt.
# These match the ``comfyui_bg_workflow.json`` and ``comfyui_video_workflow.json``
# templates bundled in ``backend/config/``.
_CLIP_NODE_ID = "6"    # CLIPTextEncode (positive prompt)
_MODEL_NODE_ID = "4"   # CheckpointLoaderSimple
_KSAMPLER_NODE_ID = "3"  # KSampler (steps override)


class ComfyUIAdapter(ImageGenAdapter):
    """Image/video generation via a running ComfyUI instance.

    Uses only stdlib ``urllib`` for HTTP requests so there is no hard
    dependency on ``requests`` or ``httpx`` beyond what the rest of the
    project already uses.

    Args:
        images_dir: Output directory for generated images.
        config_dir: Directory containing workflow JSON templates.
        endpoint: ComfyUI base URL (e.g. ``"http://localhost:8188"``).
        model: Checkpoint name to use (e.g. ``"z-image-turbo"``).

    Example:
        >>> adapter = ComfyUIAdapter(Path("storage/images"), Path("config"),
        ...                          endpoint="http://localhost:8188",
        ...                          model="z-image-turbo")
        >>> adapter.is_available()
        True
        >>> result = adapter.generate("anime bedroom, neon lights", {"width": 512})
        >>> result["url"]
        '/files/images/gen_1708615234_a3f9c12b.png'
    """

    def __init__(
        self,
        images_dir: Path,
        config_dir: Path,
        endpoint: str = "http://localhost:8188",
        model: str = "z-image-turbo",
    ) -> None:
        """
        Args:
            images_dir: Directory where generated images are saved.
            config_dir: Directory containing workflow JSON templates.
            endpoint: ComfyUI base URL.
            model: Default checkpoint name (filename without .safetensors).
        """
        super().__init__(images_dir, config_dir)
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self._client_id = str(uuid.uuid4())

    # ------------------------------------------------------------------ #
    # Internal HTTP helpers
    # ------------------------------------------------------------------ #

    def _get(self, path: str, timeout: int = 5) -> Optional[dict]:
        """HTTP GET against the ComfyUI API.

        Args:
            path: URL path (e.g. ``"/system_stats"``).
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON dict or ``None`` on any error.
        """
        try:
            url = f"{self.endpoint}{path}"
            req = Request(url)
            with urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"[ComfyUI] GET {path} failed: {exc}")
            return None

    def _post(self, path: str, data: dict, timeout: int = 30) -> Optional[dict]:
        """HTTP POST against the ComfyUI API.

        Args:
            path: URL path (e.g. ``"/prompt"``).
            data: JSON body to send.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON response or ``None`` on error.
        """
        try:
            url = f"{self.endpoint}{path}"
            body = json.dumps(data).encode("utf-8")
            req = Request(url, data=body, headers={"Content-Type": "application/json"})
            with urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"[ComfyUI] POST {path} failed: {exc}")
            return None

    # ------------------------------------------------------------------ #
    # Workflow helpers
    # ------------------------------------------------------------------ #

    def _load_workflow(self, template_name: str) -> Optional[dict]:
        """Load a workflow JSON template from config_dir.

        Args:
            template_name: Filename (e.g. ``"comfyui_bg_workflow.json"``).

        Returns:
            Parsed workflow dict, or ``None`` if file is missing.
        """
        path = self.config_dir / template_name
        if not path.exists():
            logger.warning(f"[ComfyUI] Workflow template not found: {path}")
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error(f"[ComfyUI] Failed to parse workflow {template_name}: {exc}")
            return None

    def _inject_prompt(self, workflow: dict, prompt: str, cfg: dict) -> dict:
        """Inject prompt text and generation settings into a workflow dict.

        Modifies the workflow in-place and returns it. Handles the most
        common ComfyUI node structure: CLIPTextEncode for prompt, KSampler
        for steps, CheckpointLoaderSimple for model.

        Args:
            workflow: Loaded workflow dict (from JSON template).
            prompt: Text prompt to inject.
            cfg: Generation config with optional ``steps`` and ``model`` keys.

        Returns:
            The modified workflow dict.
        """
        # Inject text prompt into CLIPTextEncode node
        if _CLIP_NODE_ID in workflow:
            workflow[_CLIP_NODE_ID]["inputs"]["text"] = prompt

        # Override steps if provided
        steps = cfg.get("steps")
        if steps and _KSAMPLER_NODE_ID in workflow:
            workflow[_KSAMPLER_NODE_ID]["inputs"]["steps"] = int(steps)

        # Override width/height in EmptyLatentImage node (typically node "5")
        width = cfg.get("width")
        height = cfg.get("height")
        if (width or height) and "5" in workflow:
            if width:
                workflow["5"]["inputs"]["width"] = int(width)
            if height:
                workflow["5"]["inputs"]["height"] = int(height)

        # Override checkpoint model if provided
        model = cfg.get("model") or self.model
        if model and _MODEL_NODE_ID in workflow:
            # ComfyUI uses the checkpoint filename with extension
            ckpt_name = model if model.endswith(".safetensors") else f"{model}.safetensors"
            workflow[_MODEL_NODE_ID]["inputs"]["ckpt_name"] = ckpt_name

        return workflow

    def _poll_for_result(self, prompt_id: str, timeout_s: int = 300) -> Optional[dict]:
        """Poll ComfyUI /history until the job completes or timeout.

        ComfyUI queues jobs asynchronously. We poll the history endpoint
        every second; once the prompt_id appears in the history the job
        is done and we extract the output image filename.

        Args:
            prompt_id: Job identifier from the ``/prompt`` POST response.
            timeout_s: Max seconds to wait before giving up.

        Returns:
            The history entry dict for the job, or ``None`` on timeout.
        """
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            history = self._get(f"/history/{prompt_id}", timeout=10)
            if history and prompt_id in history:
                return history[prompt_id]
            time.sleep(1.5)
        logger.warning(f"[ComfyUI] Timed out waiting for prompt_id={prompt_id}")
        return None

    def _extract_output_image(self, history_entry: dict) -> Optional[str]:
        """Extract the output image filename from a ComfyUI history entry.

        ComfyUI stores output filenames nested under
        ``outputs.<node_id>.images[].filename``.

        Args:
            history_entry: The history dict entry for a completed job.

        Returns:
            The first output image filename, or ``None`` if not found.
        """
        try:
            outputs = history_entry.get("outputs", {})
            for node_output in outputs.values():
                images = node_output.get("images", [])
                if images:
                    return images[0]["filename"]
        except Exception as exc:
            logger.error(f"[ComfyUI] Failed to extract output image: {exc}")
        return None

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #

    def is_available(self) -> bool:
        """Check if ComfyUI is running and responding.

        Returns:
            ``True`` if ``GET /system_stats`` responds successfully.
        """
        result = self._get("/system_stats", timeout=3)
        return result is not None

    def provider_name(self) -> str:
        """Return the provider identifier string.

        Returns:
            ``"comfyui"``
        """
        return "comfyui"

    def generate(self, prompt: str, cfg: dict) -> dict:
        """Generate an image via ComfyUI and save to images_dir.

        Loads the background workflow template, injects the prompt and
        settings, queues the job, polls until completion, downloads the
        output image, and saves it locally with a timestamped filename.

        Args:
            prompt: Text prompt for the image.
            cfg: Config dict with optional ``width``, ``height``, ``steps``,
                 ``model`` keys. Defaults to 512×512, 9 steps.

        Returns:
            ``{"ok": True, "filename": str, "url": str}`` on success, or
            ``{"ok": False, "error": str}`` on failure.
        """
        if not self.is_available():
            return {"ok": False, "error": "ComfyUI is not available"}

        # Load and customise the workflow template
        workflow = self._load_workflow("comfyui_bg_workflow.json")
        if workflow is None:
            return {"ok": False, "error": "Background workflow template not found"}

        workflow = self._inject_prompt(workflow, prompt, cfg)

        # Queue the job
        payload = {"prompt": workflow, "client_id": self._client_id}
        response = self._post("/prompt", payload)
        if not response or "prompt_id" not in response:
            return {"ok": False, "error": "ComfyUI rejected the prompt request"}

        prompt_id = response["prompt_id"]
        logger.info(f"[ComfyUI] Queued image job {prompt_id}")

        # Poll for completion
        timeout = int(cfg.get("timeout", 120))
        history_entry = self._poll_for_result(prompt_id, timeout_s=timeout)
        if history_entry is None:
            return {"ok": False, "error": f"ComfyUI generation timed out ({timeout}s)"}

        # Extract output filename and download to images_dir
        output_filename = self._extract_output_image(history_entry)
        if not output_filename:
            return {"ok": False, "error": "ComfyUI completed but no output image found"}

        # Download the image from ComfyUI's output directory
        local_name = self._mk_name("gen")
        local_path = self.images_dir / local_name
        try:
            image_url = f"{self.endpoint}/view?filename={output_filename}&type=output"
            req = Request(image_url)
            with urlopen(req, timeout=30) as resp:
                with open(local_path, "wb") as f:
                    shutil.copyfileobj(resp, f)
        except Exception as exc:
            return {"ok": False, "error": f"Failed to download generated image: {exc}"}

        logger.info(f"[ComfyUI] Image saved: {local_name}")
        return {
            "ok": True,
            "filename": local_name,
            "url": f"/files/images/{local_name}",
        }

    def generate_video(self, prompt: str, cfg: dict) -> dict:
        """Start an async video generation job via ComfyUI (Wan 2.2).

        Video generation is fundamentally asynchronous — jobs take minutes.
        This method queues the job and immediately returns a ``job_id``.
        Poll ``video_status(job_id)`` to check progress.

        Args:
            prompt: Text prompt for the video.
            cfg: Config dict with optional ``duration`` (seconds), ``fps``,
                 ``model`` keys.

        Returns:
            ``{"ok": True, "job_id": str}`` on success, or
            ``{"ok": False, "error": str}`` on failure.
        """
        if not self.is_available():
            return {"ok": False, "error": "ComfyUI is not available"}

        workflow = self._load_workflow("comfyui_video_workflow.json")
        if workflow is None:
            return {"ok": False, "error": "Video workflow template not found"}

        workflow = self._inject_prompt(workflow, prompt, cfg)

        payload = {"prompt": workflow, "client_id": self._client_id}
        response = self._post("/prompt", payload)
        if not response or "prompt_id" not in response:
            return {"ok": False, "error": "ComfyUI rejected the video prompt"}

        job_id = response["prompt_id"]
        logger.info(f"[ComfyUI] Queued video job {job_id}")
        return {"ok": True, "job_id": job_id}

    def video_status(self, job_id: str) -> dict:
        """Poll the status of an async video generation job.

        Checks ``/history/{job_id}`` — if the entry exists, the job is done.
        ComfyUI doesn't expose per-job progress so we report 0–100 via
        a simple done/not-done signal.

        Args:
            job_id: Job identifier from ``generate_video()``.

        Returns:
            ``{"status": "running"|"done"|"error", "url": str|None,
               "progress": float|None}``
        """
        # Check if job appears in history (= completed)
        history = self._get(f"/history/{job_id}", timeout=10)
        if history and job_id in history:
            entry = history[job_id]
            filename = self._extract_output_image(entry)
            if filename:
                # Try to copy locally if it's not already there
                local_name = self._mk_name("video", "mp4")
                local_path = self.images_dir / local_name
                try:
                    video_url = f"{self.endpoint}/view?filename={filename}&type=output"
                    req = Request(video_url)
                    with urlopen(req, timeout=30) as resp:
                        with open(local_path, "wb") as f:
                            shutil.copyfileobj(resp, f)
                    return {
                        "status": "done",
                        "url": f"/files/images/{local_name}",
                        "progress": 1.0,
                    }
                except Exception as exc:
                    return {"status": "error", "url": None, "error": str(exc)}
            return {"status": "error", "url": None, "error": "No output file found"}

        # Check queue status
        queue = self._get("/queue", timeout=5)
        if queue:
            # If it appears in either running or pending queue it's in progress
            running = [item[1] for item in queue.get("queue_running", [])]
            pending = [item[1] for item in queue.get("queue_pending", [])]
            if job_id in running:
                return {"status": "running", "url": None, "progress": None}
            if job_id in pending:
                return {"status": "queued", "url": None, "progress": None}

        return {"status": "queued", "url": None, "progress": None}
