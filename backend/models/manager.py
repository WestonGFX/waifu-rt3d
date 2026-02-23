"""LM Studio-native model management.

Downloads, loads, and unloads models via the LM Studio REST API (v0)
and ``lms`` CLI. Browsing and recommendations still use HuggingFace
for discovery, but all installation goes through LM Studio so it
actually knows about the files.

Typical flow:
    1. User browses recommended/search results (HuggingFace metadata).
    2. ``install()`` → ``POST /api/v0/download`` (LM Studio downloads the model).
    3. ``get_download_status()`` → ``GET /api/v0/download-status`` (real progress).
    4. ``load_model()`` → ``POST /api/v0/load`` (loads into GPU/RAM).
    5. ``unload_model()`` → ``POST /api/v0/unload``.
    6. ``list_installed()`` → ``GET /api/v0/models`` (LM Studio's own catalog).
    7. ``delete()`` → ``lms rm {model_key}`` subprocess.
"""

import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

import requests

logger = logging.getLogger("waifu.models")


class ModelManager:
    """Manages LLM models via LM Studio REST API and ``lms`` CLI.

    Args:
        config: Application config dict (must contain ``llm.endpoint``).

    Example:
        >>> mgr = ModelManager(load_config())
        >>> mgr.list_installed()
        {"llm": [{"id": "google/gemma-3-12b", "state": "loaded", ...}]}
    """

    def __init__(self, config: Dict) -> None:
        self.config = config
        self.token: Optional[str] = config.get("system", {}).get("huggingface_token")

        # Derive LM Studio base URL from OpenAI-compat endpoint (strip /v1)
        endpoint = config.get("llm", {}).get(
            "endpoint", os.environ.get("WAIFU_LLM_ENDPOINT", "http://localhost:1234/v1")
        )
        self.base_url: str = endpoint.replace("/v1", "").rstrip("/")

        # ``lms`` CLI path (auto-detect or from config)
        self.lms_path: str = config.get("system", {}).get(
            "lms_path",
            str(Path.home() / ".cache" / "lm-studio" / "bin" / "lms"),
        )

        # Keep HuggingFace API for browsing/details (read-only)
        try:
            from huggingface_hub import HfApi

            self.hf_api = HfApi(token=self.token)
        except ImportError:
            self.hf_api = None
            logger.warning("huggingface_hub not installed — browse/details unavailable")

    # ──────────────────────────────────────────────────────────────
    # LM Studio REST API wrappers
    # ──────────────────────────────────────────────────────────────

    def _lms_get(self, path: str, timeout: int = 10) -> Optional[dict]:
        """GET helper for LM Studio REST API.

        Args:
            path: API path (e.g. ``/api/v0/models``).
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON response or None on failure.
        """
        try:
            r = requests.get(f"{self.base_url}{path}", timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning(f"LM Studio GET {path} failed: {e}")
            return None

    def _lms_post(self, path: str, body: dict, timeout: int = 30) -> Optional[dict]:
        """POST helper for LM Studio REST API.

        Args:
            path: API path (e.g. ``/api/v0/load``).
            body: JSON body to send.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON response or None on failure.
        """
        try:
            r = requests.post(
                f"{self.base_url}{path}",
                json=body,
                timeout=timeout,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning(f"LM Studio POST {path} failed: {e}")
            return None

    def is_reachable(self) -> bool:
        """Check whether the LM Studio server is responding.

        Returns:
            True if the server responds to a health-check request.
        """
        try:
            r = requests.get(f"{self.base_url}/api/v0/models", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    # ──────────────────────────────────────────────────────────────
    # Core operations (LM Studio native)
    # ──────────────────────────────────────────────────────────────

    async def install(self, model_id: str, mtype: str, quantization: str = None) -> dict:
        """Download a model via LM Studio's REST API.

        Uses ``POST /api/v0/download`` which downloads the model into
        LM Studio's own storage, making it immediately visible in
        ``list_installed()``.

        Args:
            model_id: HuggingFace model identifier (e.g. ``"TheBloke/Mistral-7B-Instruct-v0.2-GGUF"``).
            mtype: Model type hint (``"llm"``, ``"coding"``, etc.) — informational only.
            quantization: Specific quantization tag (e.g. ``"Q4_K_M"``).
                          Appended to the model ID if provided so LM Studio
                          picks the right file.

        Returns:
            dict: ``{"ok": True, "id": ...}`` on success, ``{"ok": False, "error": ...}`` on failure.

        Example:
            >>> await mgr.install("TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "llm", "Q4_K_M")
            {"ok": True, "id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF"}
        """
        logger.info(f"Requesting LM Studio download: {model_id} (quant={quantization})")

        # LM Studio expects the full model ID; quantization is sometimes
        # embedded in the filename which LM Studio resolves automatically
        body: Dict = {"model": model_id}
        if quantization:
            body["quantization"] = quantization

        result = self._lms_post("/api/v0/download", body, timeout=30)
        if result is None:
            return {"ok": False, "error": "LM Studio unreachable or rejected download request"}

        return {"ok": True, "id": model_id, "detail": result}

    def get_download_status(self) -> dict:
        """Poll download progress from LM Studio.

        Returns:
            dict: Raw response from ``GET /api/v0/download-status`` or error.

        Example:
            >>> mgr.get_download_status()
            {"downloading": True, "progress": 0.45, "model": "..."}
        """
        result = self._lms_get("/api/v0/download-status", timeout=5)
        if result is None:
            return {"downloading": False, "error": "Could not query download status"}
        return result

    def load_model(self, model_id: str, context_length: Optional[int] = None) -> dict:
        """Load a downloaded model into LM Studio memory.

        Args:
            model_id: Model identifier as known by LM Studio.
            context_length: Optional context window override.

        Returns:
            dict: ``{"ok": True}`` on success or ``{"ok": False, "error": ...}``.

        Example:
            >>> mgr.load_model("google/gemma-3-12b", context_length=131072)
            {"ok": True}
        """
        body: Dict = {"model": model_id}
        if context_length:
            body["context_length"] = context_length

        logger.info(f"Loading model into LM Studio: {model_id} (ctx={context_length})")
        result = self._lms_post("/api/v0/load", body, timeout=60)
        if result is None:
            return {"ok": False, "error": "LM Studio unreachable or model load failed"}
        return {"ok": True, "detail": result}

    def unload_model(self, model_id: Optional[str] = None) -> dict:
        """Unload a model from LM Studio memory.

        Args:
            model_id: Specific model to unload, or None to unload all.

        Returns:
            dict: ``{"ok": True}`` on success.
        """
        body: Dict = {}
        if model_id:
            body["model"] = model_id

        logger.info(f"Unloading model from LM Studio: {model_id or 'all'}")
        result = self._lms_post("/api/v0/unload", body, timeout=30)
        if result is None:
            return {"ok": False, "error": "Unload request failed"}
        return {"ok": True, "detail": result}

    def list_installed(self) -> Dict[str, List[Dict]]:
        """List all models known to LM Studio with their load state.

        Queries ``GET /api/v0/models`` and categorizes each model
        by type (llm, coding, vlm, asr) based on tags/name heuristics.

        Returns:
            dict: Keyed by type, each containing a list of model dicts
                  with ``id``, ``state``, ``size_mb``, ``max_context_length``.

        Example:
            >>> mgr.list_installed()
            {"llm": [{"id": "google/gemma-3-12b", "state": "loaded", ...}]}
        """
        data = self._lms_get("/api/v0/models")
        if data is None:
            return {"llm": [], "coding": [], "vlm": [], "asr": []}

        models_list = data if isinstance(data, list) else data.get("data", [])

        categorized: Dict[str, List[Dict]] = {
            "llm": [],
            "coding": [],
            "vlm": [],
            "asr": [],
        }

        for m in models_list:
            model_id = m.get("id", "")
            state = m.get("state", "not-loaded")
            max_ctx = m.get("max_context_length", 0)

            # Heuristic type detection
            mtype = "llm"
            id_lower = model_id.lower()
            if any(kw in id_lower for kw in ("code", "coder", "deepseek-coder")):
                mtype = "coding"
            elif any(kw in id_lower for kw in ("llava", "vision", "vlm")):
                mtype = "vlm"
            elif any(kw in id_lower for kw in ("whisper", "asr")):
                mtype = "asr"

            categorized[mtype].append({
                "id": model_id,
                "state": state,
                "type": mtype,
                "max_context_length": max_ctx,
                "size_mb": m.get("size_bytes", 0) / (1024 * 1024) if m.get("size_bytes") else 0,
            })

        return categorized

    def delete(self, model_id: str, mtype: str) -> bool:
        """Delete a model from LM Studio via the ``lms rm`` CLI command.

        Args:
            model_id: Model identifier (e.g. ``"google/gemma-3-12b"``).
            mtype: Model type (informational, not used for deletion).

        Returns:
            True if deletion succeeded.
        """
        logger.info(f"Deleting model via lms CLI: {model_id}")
        try:
            result = subprocess.run(
                [self.lms_path, "rm", model_id],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                logger.info(f"Deleted model: {model_id}")
                return True
            logger.error(f"lms rm failed: {result.stderr}")
            return False
        except FileNotFoundError:
            logger.error(f"lms CLI not found at {self.lms_path}")
            return False
        except Exception as e:
            logger.error(f"Failed to delete {model_id}: {e}")
            return False

    # ──────────────────────────────────────────────────────────────
    # Hardware detection (unchanged)
    # ──────────────────────────────────────────────────────────────

    def get_hardware_profile(self) -> dict:
        """Get cached hardware stats and enhance with local detection.

        Returns:
            dict: Hardware profile with keys like ``ram_available_gb``,
                  ``vram_total_gb``, ``is_apple_silicon``, ``gpu_name``.
        """
        from backend.hardware import HardwareManager

        info = HardwareManager.get_system_stats()

        import platform

        if "is_apple_silicon" not in info:
            info["is_apple_silicon"] = (
                sys.platform == "darwin" and platform.machine() == "arm64"
            )

        if info["is_apple_silicon"] and info.get("vram_total_gb", 0) <= 0:
            import psutil

            total_ram = round(psutil.virtual_memory().total / (1024**3), 1)
            info["vram_total_gb"] = round(total_ram * 0.75, 1)
            info["gpu_name"] = "Apple Silicon (Unified)"

        return info

    # ──────────────────────────────────────────────────────────────
    # HuggingFace browsing (kept for discovery UI)
    # ──────────────────────────────────────────────────────────────

    def search(self, query: str, task: str = None, sort: str = "downloads", limit: int = 20) -> List[Dict]:
        """Search HuggingFace Hub for models (read-only browsing).

        Args:
            query: Search query string.
            task: Pipeline task filter (e.g. ``"text-generation"``).
            sort: Sort key — ``"downloads"``, ``"trending"``, ``"newest"``.
            limit: Max results to return.

        Returns:
            list[dict]: Model metadata dicts with ``id``, ``downloads``, ``tags``, etc.
        """
        if not self.hf_api:
            return []
        try:
            sort_key = "downloads"
            if sort == "trending":
                sort_key = "trending"
            elif sort == "newest":
                sort_key = "createdAt"

            params = {"sort": sort_key, "direction": -1, "limit": limit, "filter": task}
            if query:
                params["search"] = query

            models = self.hf_api.list_models(**params)
            return [
                {
                    "id": m.modelId,
                    "author": m.author,
                    "downloads": m.downloads,
                    "likes": m.likes,
                    "last_modified": str(m.lastModified),
                    "tags": m.tags,
                    "pipeline_tag": m.pipeline_tag,
                    "size_approx": "Unknown",
                }
                for m in models
            ]
        except Exception as e:
            logger.error(f"HF Search failed: {e}")
            return []

    def get_model_details(self, model_id: str) -> Dict:
        """Fetch detailed GGUF file list and estimate VRAM usage.

        Args:
            model_id: HuggingFace repo ID.

        Returns:
            dict: Model details with ``files`` list, each containing
                  ``filename``, ``quantization``, ``estimated_vram_gb``.
        """
        if not self.hf_api:
            return {"error": "HuggingFace API unavailable"}
        try:
            files = self.hf_api.list_repo_files(model_id)
            gguf_files = [f for f in files if f.endswith(".gguf")]

            params_b = 7.0
            match = re.search(r"(\d+)[\.\-_]?[bB]", model_id)
            if match:
                params_b = float(match.group(1))

            factors = {
                "Q2": 0.4, "Q3": 0.55, "Q4": 0.75, "Q5": 0.9,
                "Q6": 1.0, "Q8": 1.2, "FP16": 2.2, "unknown": 1.0,
            }

            results = []
            for f in gguf_files:
                q_type = "unknown"
                fl = f.lower()
                for qt in ["q2", "q3", "q4", "q5", "q6", "q8", "fp16"]:
                    if qt in fl:
                        q_type = qt.upper()
                        break

                est_vram = round(params_b * factors.get(q_type, 1.0) + 0.5, 2)
                results.append({
                    "filename": f,
                    "quantization": q_type,
                    "estimated_vram_gb": est_vram,
                })

            results.sort(key=lambda x: x["estimated_vram_gb"])
            return {
                "id": model_id,
                "params": params_b,
                "files": results,
                "hardware_check": self.get_hardware_profile(),
            }
        except Exception as e:
            logger.error(f"Failed to get details for {model_id}: {e}")
            return {"error": str(e)}

    def recommend_models(self, mtype: str = "llm") -> List[Dict]:
        """Return curated model recommendations filtered by hardware compatibility.

        Args:
            mtype: Model category — ``"llm"``, ``"coding"``, ``"vlm"``, ``"asr"``.

        Returns:
            list[dict]: Model recommendations with ``id``, ``tags``, ``min_ram``,
                        ``compatible`` flag, and optional ``compatibility_issue``.
        """
        hw = self.get_hardware_profile()
        vram = hw.get("vram_total_gb", 0)
        ram = hw.get("ram_available_gb", 0)
        is_mlx = hw.get("is_apple_silicon", False)

        candidates: List[Dict] = []

        if mtype == "llm":
            candidates.extend([
                {"id": "Lewdiculous/L3-8B-Stheno-v3.2-GGUF-IQ-Imatrix", "type": "llm", "min_ram": 8, "tags": ["trending", "roleplay", "uncensored"]},
                {"id": "TheBloke/DarkDesires-v1.0-GGUF", "type": "llm", "min_ram": 8, "tags": ["classic", "uncensored", "dark"]},
                {"id": "Lewdiculous/Llama-3-Lumimaid-8B-v0.1-OAS-GGUF-IQ-Imatrix", "type": "llm", "min_ram": 8, "tags": ["roleplay", "lumimaid"]},
                {"id": "Nitral-AI/Wayfarer_Eris_Noctis-12B-GGUF", "type": "llm", "min_ram": 16, "tags": ["roleplay", "12B", "storytelling"]},
                {"id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "type": "llm", "min_ram": 8, "tags": ["classic", "reliable", "7B"]},
                {"id": "MaziyarPanahi/Llama-3-8B-Instruct-v0.1-GGUF", "type": "llm", "min_ram": 8, "tags": ["meta", "sota", "8B"]},
                {"id": "bartowski/Hermes-2-Pro-Llama-3-8B-GGUF", "type": "llm", "min_ram": 8, "tags": ["uncensored", "agentic", "8B"]},
                {"id": "TheBloke/Phi-2-GGUF", "type": "llm", "min_ram": 4, "tags": ["microsoft", "smart", "3B"]},
                {"id": "mradermacher/Qwen2.5-0.5B-Instruct-GGUF", "type": "llm", "min_ram": 1, "tags": ["fast", "smart", "0.5B"]},
                {"id": "TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF", "type": "llm", "min_ram": 24, "tags": ["moe", "smart", "45B"]},
            ])
        elif mtype == "coding":
            candidates.extend([
                {"id": "TheBloke/CodeLlama-7B-Instruct-GGUF", "type": "coding", "min_ram": 8, "tags": ["meta", "coding", "7B"]},
                {"id": "Qwen/Qwen1.5-1.8B-Chat-GGUF", "type": "coding", "min_ram": 3, "tags": ["coding", "fast"]},
                {"id": "white-rabbit-neo/WhiteRabbitNeo-13B-v1-GGUF", "type": "coding", "min_ram": 16, "tags": ["hacking", "security", "13B"]},
                {"id": "mradermacher/DeepSeek-Coder-V2-Lite-Instruct-GGUF", "type": "coding", "min_ram": 16, "tags": ["deepseek", "coding", "sota"]},
            ])
        elif mtype == "vlm":
            candidates.extend([
                {"id": "mys/ggml_llava-v1.5-7b", "type": "vlm", "min_ram": 8, "tags": ["vision", "7B"]},
                {"id": "jartine/llava-v1.6-mistral-7b-hf-GGUF", "type": "vlm", "min_ram": 10, "tags": ["vision", "better", "7B"]},
            ])
        elif mtype == "asr":
            candidates.extend([
                {"id": "csukuangfj/sherpa-onnx-whisper-tiny.en", "type": "asr", "min_ram": 1, "tags": ["fast", "english", "cpu"]},
                {"id": "csukuangfj/sherpa-onnx-whisper-base.en", "type": "asr", "min_ram": 2, "tags": ["balanced", "english"]},
                {"id": "csukuangfj/sherpa-onnx-whisper-small.en", "type": "asr", "min_ram": 4, "tags": ["accurate", "english"]},
            ])

        # Append MLX variants for Apple Silicon
        if is_mlx:
            mlx_candidates = [
                {"id": "mlx-community/Mistral-7B-Instruct-v0.2-4bit", "type": "llm", "min_ram": 8, "tags": ["mlx", "apple-silicon", "fast"]},
                {"id": "mlx-community/Llama-3-8B-Instruct-4bit", "type": "llm", "min_ram": 8, "tags": ["mlx", "meta", "sota"]},
                {"id": "mlx-community/Phi-3-mini-4k-instruct-4bit", "type": "llm", "min_ram": 4, "tags": ["mlx", "microsoft", "small"]},
                {"id": "mlx-community/Qwen2.5-7B-Instruct-4bit", "type": "coding", "min_ram": 8, "tags": ["mlx", "qwen", "coding"]},
            ]
            for m in mlx_candidates:
                if m["type"] == mtype:
                    candidates.append(m)

        # Add compatibility flags
        for c in candidates:
            is_compatible = True
            if is_mlx and "mlx" in c["tags"]:
                if c.get("min_ram", 0) > ram:
                    is_compatible = False
            elif c.get("min_ram", 0) > ram + 2:
                is_compatible = False
                c["compatibility_issue"] = "Low RAM"
            c["compatible"] = is_compatible

        return candidates
