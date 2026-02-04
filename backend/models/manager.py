import os
import logging
import asyncio
import shutil
import json
from typing import List, Dict, Optional
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
from backend.hardware import HardwareManager

logger = logging.getLogger("waifu.models")

class ModelManager:
    def __init__(self, config: Dict):
        self.config = config
        self.token = config.get("system", {}).get("huggingface_token")
        self.api = HfApi(token=self.token)
        
        # Resolve base paths
        self.paths = config.get("system", {}).get("model_paths", {
            "llm": "backend/storage/models/llm",
            "tts": "backend/storage/models/tts",
            "asr": "backend/storage/models/asr"
        })

    def get_hardware_profile(self):
        """Get cached hardware stats and enhance with local detection."""
        # Baseline stats from HardwareManager
        info = HardwareManager.get_system_stats()
        
        # Enhanced detection for Apple Silicon (if not already present)
        import sys, platform
        if "is_apple_silicon" not in info:
            info["is_apple_silicon"] = (sys.platform == 'darwin' and platform.machine() == 'arm64')
            
        if info["is_apple_silicon"] and info.get("vram_total_gb", 0) <= 0:
             # Fallback VRAM estimation for Unified Memory
             import psutil
             total_ram = round(psutil.virtual_memory().total / (1024**3), 1)
             # Unified memory usually shares ~75% for GPU
             info["vram_total_gb"] = round(total_ram * 0.75, 1)
             info["gpu_name"] = "Apple Silicon (Unified)"
             
        return info

    def search(self, query: str, task: str = None, sort: str = "downloads", limit: int = 20) -> List[Dict]:
        """Search HF with added compatibility info."""
        try:
            sort_key = "downloads"
            if sort == "trending": sort_key = "trending"
            elif sort == "newest": sort_key = "createdAt"

            params = {"sort": sort_key, "direction": -1, "limit": limit, "filter": task}
            if query: params["search"] = query
                
            models = self.api.list_models(**params)
            hw = self.get_hardware_profile()
            
            results = []
            for m in models:
                # Estimate requirements (very rough heuristic)
                # 7B float16 ~= 14GB, 4-bit ~= 5GB
                # We'll just pass raw data for frontend to display for now
                results.append({
                    "id": m.modelId,
                    "author": m.author,
                    "downloads": m.downloads,
                    "likes": m.likes,
                    "last_modified": str(m.lastModified),
                    "tags": m.tags,
                    "pipeline_tag": m.pipeline_tag,
                    "size_approx": "Unknown" # Need to query files to get size, too slow for list
                })
            return results
        except Exception as e:
            logger.error(f"HF Search failed: {e}")
            return []

    def get_model_details(self, model_id: str) -> Dict:
        """Fetch detailed file list and estimate VRAM usage."""
        try:
            files = self.api.list_repo_files(model_id)
            
            # 1. Filter for GGUF
            gguf_files = [f for f in files if f.endswith(".gguf")]
            
            # 2. Heuristic for Parameter Count (e.g., "7b", "13b")
            params_b = 7.0 # Default fallback
            import re
            match = re.search(r'(\d+)[\.\-_]?[bB]', model_id)
            if match:
                params_b = float(match.group(1))
                
            # 3. Build File List with Stats
            results = []
            for f in gguf_files:
                # Quantization Heuristics
                q_type = "unknown"
                if "q4" in f.lower(): q_type = "Q4"
                elif "q5" in f.lower(): q_type = "Q5"
                elif "q8" in f.lower(): q_type = "Q8"
                elif "fp16" in f.lower(): q_type = "FP16"
                elif "q2" in f.lower(): q_type = "Q2"
                elif "q3" in f.lower(): q_type = "Q3"
                elif "q6" in f.lower(): q_type = "Q6"
                
                # VRAM Estimation Factors (GB per Billion Params)
                # Includes some overhead for KV cache (context)
                factors = {
                    "Q2": 0.4, "Q3": 0.55, 
                    "Q4": 0.75, "Q5": 0.9, 
                    "Q6": 1.0, "Q8": 1.2, 
                    "FP16": 2.2, "unknown": 1.0
                }
                est_vram = round(params_b * factors.get(q_type, 1.0) + 0.5, 2) # +0.5GB buffer
                
                results.append({
                    "filename": f,
                    "quantization": q_type,
                    "estimated_vram_gb": est_vram,
                    "size_info": "Querying...", # file size requires HEAD request, might be slow for all
                })
                
            # Sort by quantization quality/size (rough)
            results.sort(key=lambda x: x["estimated_vram_gb"])
            
            return {
                "id": model_id,
                "params": params_b,
                "files": results,
                "hardware_check": self.get_hardware_profile()
            }
            
        except Exception as e:
            logger.error(f"Failed to get details for {model_id}: {e}")
            return {"error": str(e)}

    def recommend_models(self, type: str = "llm") -> List[Dict]:
        """Return a list of curated, compatible models based on hardware."""
        hw = self.get_hardware_profile()
        vram = hw.get("vram_total_gb", 0)
        ram = hw.get("ram_available_gb", 0)
        is_mlx = hw.get("is_apple_silicon", False)
        
        candidates = []

        # --- LLM (Chat/Roleplay) ---
        if type == "llm":
            candidates.extend([
                # --- TRENDING / UNCENSORED / ROLEPLAY (Top of List) ---
                {"id": "Lewdiculous/L3-8B-Stheno-v3.2-GGUF-IQ-Imatrix", "type": "llm", "min_ram": 8, "tags": ["trending","roleplay","uncensored"]},
                {"id": "TheBloke/DarkDesires-v1.0-GGUF", "type": "llm", "min_ram": 8, "tags": ["classic","uncensored","dark"]},
                {"id": "Lewdiculous/Llama-3-Lumimaid-8B-v0.1-OAS-GGUF-IQ-Imatrix", "type": "llm", "min_ram": 8, "tags": ["roleplay","lumimaid"]},
                {"id": "Nitral-AI/Wayfarer_Eris_Noctis-12B-GGUF", "type": "llm", "min_ram": 16, "tags": ["roleplay","12B","storytelling"]},
                
                # --- BALANCED ---
                {"id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "type": "llm", "min_ram": 8, "tags": ["classic","reliable","7B"]},
                {"id": "MaziyarPanahi/Llama-3-8B-Instruct-v0.1-GGUF", "type": "llm", "min_ram": 8, "tags": ["meta","sota","8B"]},
                {"id": "bartowski/Hermes-2-Pro-Llama-3-8B-GGUF", "type": "llm", "min_ram": 8, "tags": ["uncensored","agentic","8B"]},
                
                # --- LIGHTWEIGHT --- 
                {"id": "TheBloke/Phi-2-GGUF", "type": "llm", "min_ram": 4, "tags": ["microsoft","smart","3B"]},
                {"id": "mradermacher/Qwen2.5-0.5B-Instruct-GGUF", "type": "llm", "min_ram": 1, "tags": ["fast","smart","0.5B"]},
                
                # --- HEAVYWEIGHT ---
                {"id": "TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF", "type": "llm", "min_ram": 24, "tags": ["moe","smart","45B"]},
            ])
            
        # --- CODING (Separate Category) ---
        elif type == "coding":
            candidates.extend([
                {"id": "TheBloke/CodeLlama-7B-Instruct-GGUF", "type": "coding", "min_ram": 8, "tags": ["meta","coding","7B"]},
                {"id": "Qwen/Qwen1.5-1.8B-Chat-GGUF", "type": "coding", "min_ram": 3, "tags": ["coding","fast"]},
                {"id": "white-rabbit-neo/WhiteRabbitNeo-13B-v1-GGUF", "type": "coding", "min_ram": 16, "tags": ["hacking","security","13B"]},
                {"id": "mradermacher/DeepSeek-Coder-V2-Lite-Instruct-GGUF", "type": "coding", "min_ram": 16, "tags": ["deepseek","coding","sota"]}
            ])

        # --- TTS / ASR / VISION ---
        elif type == "vlm":
             candidates.extend([
                {"id": "mys/ggml_llava-v1.5-7b", "type": "vlm", "min_ram": 8, "tags": ["vision","7B"]},
                {"id": "jartine/llava-v1.6-mistral-7b-hf-GGUF", "type": "vlm", "min_ram": 10, "tags": ["vision","better","7B"]},
             ])
        elif type == "asr":
            candidates.extend([
                {"id": "csukuangfj/sherpa-onnx-whisper-tiny.en", "type": "asr", "min_ram": 1, "tags": ["fast", "english", "cpu"]},
                {"id": "csukuangfj/sherpa-onnx-whisper-base.en", "type": "asr", "min_ram": 2, "tags": ["balanced", "english"]},
                {"id": "csukuangfj/sherpa-onnx-whisper-small.en", "type": "asr", "min_ram": 4, "tags": ["accurate", "english"]},
            ])

        # --- MLX MODELS (APPLE SILICON) ---
        # Append to the *end* of the list if matches type
        if is_mlx:
            mlx_candidates = [
                 {"id": "mlx-community/Mistral-7B-Instruct-v0.2-4bit", "type": "llm", "min_ram": 8, "tags": ["mlx","apple-silicon","fast"]},
                 {"id": "mlx-community/Llama-3-8B-Instruct-4bit", "type": "llm", "min_ram": 8, "tags": ["mlx","meta","sota"]},
                 {"id": "mlx-community/Phi-3-mini-4k-instruct-4bit", "type": "llm", "min_ram": 4, "tags": ["mlx","microsoft","small"]},
                 {"id": "mlx-community/Qwen2.5-7B-Instruct-4bit", "type": "coding", "min_ram": 8, "tags": ["mlx","qwen","coding"]} 
            ]
            
            # Filter MLX candidates by requested type
            for m in mlx_candidates:
                # Map MLX types if needed, or strict match
                if m["type"] == type or (type == "llm" and m["type"] == "llm") or (type == "coding" and m["type"] == "coding"):
                     candidates.append(m)

        valid = []
        for c in candidates:
            # Smart filtering
            is_compatible = True
            if is_mlx and "mlx" in c["tags"]:
                 if c.get("min_ram") > ram: is_compatible = False
            elif c.get("min_ram") > ram + 2: # Buffer for GGUF
                is_compatible = False
                c["compatibility_issue"] = "Low RAM"
            
            c["compatible"] = is_compatible
            valid.append(c)
            
        return valid

    async def install(self, model_id: str, type: str, quantization: str = None):
        """Install model and generate metadata card.
        
        Args:
            model_id: HuggingFace repo ID
            type: Model type (llm, tts, asr)
            quantization: Specific quantization to download (e.g., 'Q4_K_M', 'int8'). 
                          If None, downloads full repo (Not recommended).
        """
        path_str = self.paths.get(type)
        if not path_str: return {"ok": False, "error": f"Unknown type: {type}"}
            
        target_dir = Path(path_str)
        target_dir.mkdir(parents=True, exist_ok=True)
        
        # Clean directory name
        model_dir_name = model_id.replace("/", "_") + (f"_{quantization}" if quantization else "")
        final_path = target_dir / model_dir_name
        
        logger.info(f"Installing {model_id} (Quant: {quantization}) to {final_path}")
        
        def _download():
            from huggingface_hub import hf_hub_download
            
            if quantization:
                # Download specific file pattern
                # Heuristic: Match *.{quantization}.gguf or similar patterns
                # This is tricky as naming conventions vary. 
                # For GGUF (TheBloke), it is usually 'model-name.Q4_K_M.gguf'
                
                # We will try to find a file matching the quantization string
                api = HfApi(token=self.token)
                files = api.list_repo_files(model_id)
                
                # Filter for the specific quantization file
                # Case insensitive search for .gguf files containing the quantization tag
                candidates = [f for f in files if quantization.lower() in f.lower() and f.endswith(".gguf")]
                
                if not candidates:
                    raise ValueError(f"No GGUF file found for quantization '{quantization}' in {model_id}")
                
                # Pick the shortest match (usually the main model file, avoiding split parts if possible?)
                # Or just pick the first one.
                target_file = candidates[0] 
                
                logger.info(f"Downloading specific file: {target_file}")
                
                return hf_hub_download(
                    repo_id=model_id,
                    filename=target_file,
                    local_dir=final_path,
                    local_dir_use_symlinks=False,
                    token=self.token
                )
            else:
                # Legacy: Download EVERYTHING (Dangerous for disk space)
                logger.warning(f"No quantization specified for {model_id}. Downloading FULL repo.")
                return snapshot_download(
                    repo_id=model_id,
                    local_dir=final_path,
                    local_dir_use_symlinks=False,
                    token=self.token
                )

        try:
            loop = asyncio.get_event_loop()
            path = await loop.run_in_executor(None, _download)
            
            # Save Metadata Card
            card = {
                "id": model_id,
                "type": type,
                "quantization": quantization,
                "installed_at": os.path.exists(path) and os.path.getctime(path),
                "requirements": {"k": "v"} # Placeholder
            }
            # If path is a file (single file download), get parent dir
            card_path = Path(path) if Path(path).is_dir() else Path(path).parent
            (card_path / "model_card.json").write_text(json.dumps(card))
            
            return {"ok": True, "path": str(path), "id": model_id}
        except Exception as e:
            logger.error(f"Install failed: {e}")
            return {"ok": False, "error": str(e)}

    def list_installed(self) -> Dict[str, List[Dict]]:
        installed = {}
        for mtype, path_str in self.paths.items():
            path = Path(path_str)
            if not path.exists():
                installed[mtype] = []
                continue
            
            models = []
            for d in path.iterdir():
                if d.is_dir():
                    # Check for card
                    card_path = d / "model_card.json"
                    meta = {}
                    if card_path.exists():
                        try: meta = json.loads(card_path.read_text())
                        except: pass
                    
                    models.append({
                        "id": meta.get("id", d.name.replace("_", "/")),
                        "name": d.name,
                        "type": mtype,
                        "path": str(d),
                        "size_mb": round(sum(f.stat().st_size for f in d.glob('**/*') if f.is_file()) / (1024*1024), 2),
                        "metadata": meta
                    })
            installed[mtype] = models
        return installed

    def delete(self, model_id: str, type: str) -> bool:
        path_str = self.paths.get(type)
        if not path_str: return False
        clean_id = model_id.replace("/", "_")
        target = Path(path_str) / clean_id
        if target.exists():
            try:
                shutil.rmtree(target)
                return True
            except Exception as e:
                logger.error(f"Failed to delete {target}: {e}")
                pass
        return False
