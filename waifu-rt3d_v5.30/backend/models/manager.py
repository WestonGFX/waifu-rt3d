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
        """Get cached hardware stats."""
        return HardwareManager.get_system_stats()

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

    def recommend_models(self, type: str = "llm") -> List[Dict]:
        """Return a list of curated, compatible models based on hardware."""
        hw = self.get_hardware_profile()
        vram = hw.get("vram_total_gb", 0)
        ram = hw.get("ram_available_gb", 0)
        
        # Curated list of "Golden" models
        candidates = [
            # Low Spec (CPU/Low RAM)
            {"id": "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF", "type": "llm", "min_ram": 2, "tags": ["fast","cpu"]},
            {"id": "TheBloke/Phi-2-GGUF", "type": "llm", "min_ram": 4, "tags": ["smart","small"]},
            
            # Mid Spec (8GB RAM / 6GB VRAM)
            {"id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "type": "llm", "min_ram": 8, "tags": ["best-value"]},
            {"id": "TheBloke/Llama-3-8B-Instruct-GGUF", "type": "llm", "min_ram": 8, "tags": ["new","meta"]},
            
            # High Spec (12GB+ VRAM)
            {"id": "Dark-Desires-12B-v1_0-Q6_K", "type": "llm", "min_ram": 16, "tags": ["uncensored","roleplay"]},
            {"id": "deepseek-ai/deepseek-coder-33b-instruct", "type": "llm", "min_ram": 32, "tags": ["coding"]}
        ]
        
        valid = []
        for c in candidates:
            if c["type"] != type: continue
            
            # Smart filtering
            is_compatible = True
            if c.get("min_ram") > ram + 2: # Buffer
                is_compatible = False
                c["compatibility_issue"] = "Low RAM"
            
            c["compatible"] = is_compatible
            valid.append(c)
            
        return valid

    async def install(self, model_id: str, type: str):
        """Install model and generate metadata card."""
        path_str = self.paths.get(type)
        if not path_str: return {"ok": False, "error": f"Unknown type: {type}"}
            
        target_dir = Path(path_str)
        target_dir.mkdir(parents=True, exist_ok=True)
        
        model_dir_name = model_id.replace("/", "_")
        final_path = target_dir / model_dir_name
        
        logger.info(f"Installing {model_id} to {final_path}")
        
        def _download():
            return snapshot_download(
                repo_id=model_id,
                local_dir=final_path,
                local_dir_use_symlinks=False,
                token=self.token,
                # For GGUF, we might want to filter specific files? 
                # For now getting full repo. 
                # TODO: Optimization for single file GGUF
            )

        try:
            loop = asyncio.get_event_loop()
            path = await loop.run_in_executor(None, _download)
            
            # Save Metadata Card
            card = {
                "id": model_id,
                "type": type,
                "installed_at": os.path.exists(path) and os.path.getctime(path),
                "requirements": {"k": "v"} # Placeholder
            }
            (Path(path) / "model_card.json").write_text(json.dumps(card))
            
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
