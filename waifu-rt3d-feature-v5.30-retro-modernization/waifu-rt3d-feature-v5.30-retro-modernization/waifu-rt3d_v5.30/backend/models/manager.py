import os
import logging
import asyncio
import shutil
from typing import List, Dict, Optional
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download

logger = logging.getLogger("waifu.models")

class ModelManager:
    def __init__(self, config: Dict):
        self.config = config
        self.token = config.get("system", {}).get("huggingface_token")
        self.api = HfApi(token=self.token)
        
        # Resolve base paths from config or default
        self.paths = config.get("system", {}).get("model_paths", {
            "llm": "backend/storage/models/llm",
            "tts": "backend/storage/models/tts",
            "asr": "backend/storage/models/asr"
        })

    def search(self, query: str, task: str = None, sort: str = "downloads", limit: int = 20) -> List[Dict]:
        """Search HuggingFace Hub for models."""
        try:
            # Map simplified sort keys to HF keys
            sort_key = "downloads"
            if sort == "trending": sort_key = "trending"
            elif sort == "newest": sort_key = "createdAt"
            elif sort == "updated": sort_key = "lastModified"

            params = {
                "sort": sort_key,
                "direction": -1,
                "limit": limit,
                "filter": task if task else None
            }
            
            if query:
                params["search"] = query
                
            models = self.api.list_models(**params)
            
            results = []
            for m in models:
                results.append({
                    "id": m.modelId,
                    "author": m.author,
                    "downloads": m.downloads,
                    "likes": m.likes,
                    "last_modified": str(m.lastModified),
                    "tags": m.tags,
                    "pipeline_tag": m.pipeline_tag
                })
            return results
        except Exception as e:
            logger.error(f"HF Search failed: {e}")
            return []

    async def install(self, model_id: str, type: str):
        """Install a model from HF."""
        # Determine target directory based on type
        # Paths are relative to project root usually, but let's ensure we resolve them relative to where this runs if needed.
        # Assuming execution from project root
        
        path_str = self.paths.get(type)
        if not path_str:
            return {"ok": False, "error": f"Unknown model type: {type}"}
            
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
                token=self.token
            )

        try:
            # Run blocking download in executor
            loop = asyncio.get_event_loop()
            path = await loop.run_in_executor(None, _download)
            return {"ok": True, "path": str(path), "id": model_id}
        except Exception as e:
            logger.error(f"Install failed: {e}")
            return {"ok": False, "error": str(e)}

    def list_installed(self) -> Dict[str, List[Dict]]:
        """List all installed models by type."""
        installed = {}
        
        for mtype, path_str in self.paths.items():
            path = Path(path_str)
            if not path.exists():
                installed[mtype] = []
                continue
                
            models = []
            for d in path.iterdir():
                if d.is_dir():
                    # Simple metadata check - ideally we'd look for a model card or config
                    models.append({
                        "id": d.name.replace("_", "/"), # rough reconstruction
                        "path": str(d),
                        "name": d.name,
                        "type": mtype
                    })
            installed[mtype] = models
            
        return installed

    def delete(self, model_id: str, type: str) -> bool:
        """Delete an installed model."""
        path_str = self.paths.get(type)
        if not path_str: return False
        
        # Handle both "author/model" and "author_model" formats for safety
        clean_id = model_id.replace("/", "_")
        target = Path(path_str) / clean_id
        
        if target.exists():
            try:
                shutil.rmtree(target)
                return True
            except Exception as e:
                logger.error(f"Failed to delete {target}: {e}")
                return False
        return False
