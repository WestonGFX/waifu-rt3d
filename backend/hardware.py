import psutil
import platform
import logging

logger = logging.getLogger("waifu.hardware")

class HardwareManager:
    @staticmethod
    def get_system_stats():
        """Get current system resource detection."""
        stats = {
            "platform": platform.system(),
            "cpu_cores": psutil.cpu_count(logical=False),
            "cpu_threads": psutil.cpu_count(logical=True),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "ram_available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
            "gpu_name": "Unknown",
            "vram_total_gb": 0,
            "accelerator": "cpu"
        }

        # Apple Silicon Detection
        if platform.system() == "Darwin" and platform.machine() == "arm64":
            stats["gpu_name"] = "Apple Silicon (Shared Memory)"
            stats["accelerator"] = "mps"
            stats["vram_total_gb"] = stats["ram_total_gb"] # Shared memory
        
        # NVIDIA Detection (if pynvml/torch available - keeping it lightweight for now)
        try:
            import torch
            if torch.cuda.is_available():
                stats["accelerator"] = "cuda"
                stats["gpu_name"] = torch.cuda.get_device_name(0)
                stats["vram_total_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"GPU detection failed: {e}")

        return stats

    @staticmethod
    def check_compatibility(requirements: dict) -> dict:
        """
        Check if system meets requirements.
        reqs = {"min_ram": 8, "min_vram": 4, "gpu_required": False}
        """
        stats = HardwareManager.get_system_stats()
        issues = []
        
        if stats["ram_available_gb"] < requirements.get("min_ram", 0):
            # Strict check vs available, or total? Usually total for capacity, available for running.
            # Let's verify total for installation feasibility.
            if stats["ram_total_gb"] < requirements.get("min_ram", 0):
                 issues.append(f"Insufficient RAM: {stats['ram_total_gb']}GB < {requirements['min_ram']}GB")
        
        if requirements.get("gpu_required") and stats["accelerator"] == "cpu":
            issues.append("GPU required but not found")
            
        if stats["vram_total_gb"] < requirements.get("min_vram", 0):
             issues.append(f"Insufficient VRAM: {stats['vram_total_gb']}GB < {requirements['min_vram']}GB")

        return {"compatible": len(issues) == 0, "issues": issues}
