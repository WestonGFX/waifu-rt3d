"""LM Studio Link device discovery and smart inference routing.

Discovers and manages LM Studio instances connected via Link (Tailscale-based
P2P mesh). Provides intelligent routing decisions based on loaded models,
hardware capabilities, latency, and task type.

Discovery approaches (tried in order):
1. ``lms link status --json`` CLI — returns connected peers
2. Configured static endpoints in ``app.json`` — fallback for non-Link setups

Example:
    >>> mgr = LinkManager.instance()
    >>> devices = await mgr.discover_devices()
    >>> best = await mgr.get_best_device("chat")
    >>> if best:
    ...     print(f"Route to {best.display_name} — {best.models_loaded}")
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Path to the bundled model catalog JSON
_CATALOG_PATH = Path(__file__).parent.parent / "data" / "model_catalog.json"

import httpx

logger = logging.getLogger(__name__)

# Default LM Studio port
_DEFAULT_PORT = 1234

# Path to lms CLI (macOS default from LM Studio installer)
_LMS_CLI = Path("/Users/chris/.cache/lm-studio/bin/lms")

# Singleton instance
_instance: Optional["LinkManager"] = None


@dataclass
class LinkDevice:
    """Represents a single LM Studio instance (local or remote via Link).

    Attributes:
        device_id: Unique device identifier from Link (hex hash) or "local".
        display_name: Human-readable device name (e.g. "Chris-MacBook-14.local").
        endpoint: Full base URL for the OpenAI-compat API (e.g. "http://192.168.1.10:1234/v1").
        online: Whether the device responded to the last health check.
        models_loaded: List of model identifiers currently loaded in memory.
        hardware: Hardware info dict (gpu, vram_gb, ram_gb, arch, backend).
        latency_ms: Round-trip ping time in milliseconds (-1 if unknown).
        is_local: Whether this is the local machine's LM Studio instance.
        model_details: Detailed model metadata from ``/v1/models`` or ``lms ps --json``.
    """

    device_id: str = ""
    display_name: str = ""
    endpoint: str = ""
    online: bool = False
    models_loaded: list[str] = field(default_factory=list)
    hardware: dict = field(default_factory=dict)
    latency_ms: int = -1
    is_local: bool = False
    model_details: list[dict] = field(default_factory=list)


@dataclass
class RoutingDecision:
    """Result of a routing decision with explanation.

    Attributes:
        device: The chosen device (None if no suitable device found).
        endpoint: The endpoint URL to use for the LLM call.
        model: The model identifier to request.
        reason: Human-readable explanation of why this device was chosen.
    """

    device: Optional[LinkDevice] = None
    endpoint: str = ""
    model: str = ""
    reason: str = ""


class LinkManager:
    """Discovers and manages LM Studio Link devices for smart inference routing.

    The manager maintains a cached list of known devices, refreshed on demand
    or at configurable intervals. It provides routing decisions based on:
    - Which devices have compatible models loaded
    - Device latency (prefer lower)
    - VRAM headroom (prefer more)
    - Task type (chat prefers quality, TTS prefers speed, etc.)

    Example:
        >>> mgr = LinkManager.instance()
        >>> await mgr.refresh()
        >>> decision = await mgr.route("chat", preferred_model="cydonia-24b")
        >>> print(decision.endpoint, decision.model)
    """

    def __init__(self) -> None:
        """Initialize the LinkManager with empty device cache."""
        self._devices: list[LinkDevice] = []
        self._last_refresh: float = 0.0
        self._refresh_interval: float = 30.0  # seconds between auto-refreshes
        self._cfg: dict = {}

    @classmethod
    def instance(cls) -> "LinkManager":
        """Get or create the singleton LinkManager instance.

        Returns:
            The global LinkManager instance.
        """
        global _instance
        if _instance is None:
            _instance = cls()
        return _instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton (for testing).

        Clears the global instance so a fresh one is created on next access.
        """
        global _instance
        _instance = None

    def configure(self, cfg: dict) -> None:
        """Update configuration from app config.

        Args:
            cfg: App configuration dict. Reads ``llm.link`` section for
                static endpoints and discovery preferences.
        """
        self._cfg = cfg

    @property
    def devices(self) -> list[LinkDevice]:
        """Return the current cached device list."""
        return list(self._devices)

    async def discover_devices(self) -> list[LinkDevice]:
        """Discover all LM Studio instances (local + Link peers).

        Tries ``lms link status --json`` first, then falls back to
        configured static endpoints. Always includes the local instance.

        Returns:
            List of discovered LinkDevice objects.
        """
        devices: list[LinkDevice] = []

        # 1. Always add local LM Studio instance
        local = await self._probe_local()
        if local:
            devices.append(local)

        # 2. Discover Link peers via CLI
        peers = await self._discover_link_peers()
        devices.extend(peers)

        # 3. Add any static endpoints from config
        static = self._get_static_endpoints()
        for ep in static:
            # Don't duplicate if already discovered
            if not any(d.endpoint == ep["endpoint"] for d in devices):
                dev = LinkDevice(
                    device_id=ep.get("id", "static"),
                    display_name=ep.get("name", ep["endpoint"]),
                    endpoint=ep["endpoint"],
                )
                devices.append(dev)

        self._devices = devices
        self._last_refresh = time.time()
        return devices

    async def refresh(self) -> list[LinkDevice]:
        """Refresh device list if stale, then health-check all devices.

        Returns:
            Updated list of LinkDevice objects with fresh online/latency data.
        """
        if time.time() - self._last_refresh > self._refresh_interval:
            await self.discover_devices()

        # Health check all devices concurrently
        tasks = [self.health_check(d) for d in self._devices]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        return self._devices

    async def get_best_device(
        self,
        capability: str = "chat",
        *,
        preferred_model: str = "",
    ) -> Optional[LinkDevice]:
        """Pick the best device for a given task type.

        Routing logic:
        1. Filter to online devices with compatible models loaded
        2. If preferred_model specified, prefer devices with it loaded
        3. Apply task-specific ranking (quality vs speed vs latency)
        4. Fall back to local if no remote is suitable

        Args:
            capability: Task type — "chat", "vision", "summarization", "tts".
            preferred_model: Optional model ID to prefer.

        Returns:
            Best matching device, or None if no devices are available.
        """
        if not self._devices:
            await self.refresh()

        online = [d for d in self._devices if d.online]
        if not online:
            return None

        # If preferred model specified, prefer devices that have it loaded
        if preferred_model:
            with_model = [
                d for d in online
                if any(preferred_model.lower() in m.lower() for m in d.models_loaded)
            ]
            if with_model:
                online = with_model

        # Sort by task-specific criteria
        if capability == "chat":
            # Prefer devices with largest models (more params = better RP)
            online.sort(key=lambda d: (
                -len(d.models_loaded),  # more models = more options
                d.latency_ms if d.latency_ms >= 0 else 9999,
            ))
        elif capability == "vision":
            # Prefer devices with vision models, lowest latency
            has_vision = [d for d in online if any("vl" in m.lower() or "vision" in m.lower() for m in d.models_loaded)]
            if has_vision:
                online = has_vision
            online.sort(key=lambda d: d.latency_ms if d.latency_ms >= 0 else 9999)
        elif capability in ("tts", "summarization"):
            # Prefer lowest latency (local preferred for TTS)
            online.sort(key=lambda d: (
                0 if d.is_local else 1,
                d.latency_ms if d.latency_ms >= 0 else 9999,
            ))
        else:
            # Default: prefer local, then by latency
            online.sort(key=lambda d: (
                0 if d.is_local else 1,
                d.latency_ms if d.latency_ms >= 0 else 9999,
            ))

        return online[0] if online else None

    async def route(
        self,
        capability: str = "chat",
        *,
        preferred_model: str = "",
        fallback_endpoint: str = "",
        fallback_model: str = "",
    ) -> RoutingDecision:
        """Make a full routing decision for an LLM call.

        Args:
            capability: Task type for routing preference.
            preferred_model: Model ID to prefer.
            fallback_endpoint: Endpoint to use if no Link device is available.
            fallback_model: Model to use if no Link device is available.

        Returns:
            RoutingDecision with device, endpoint, model, and explanation.
        """
        device = await self.get_best_device(capability, preferred_model=preferred_model)

        if device:
            # Pick the best model from this device
            model = preferred_model
            if not model and device.models_loaded:
                model = device.models_loaded[0]

            return RoutingDecision(
                device=device,
                endpoint=device.endpoint,
                model=model,
                reason=f"Routed to {device.display_name} ({device.device_id}): "
                       f"{len(device.models_loaded)} models loaded, "
                       f"{device.latency_ms}ms latency",
            )

        # Fallback to configured endpoint
        return RoutingDecision(
            device=None,
            endpoint=fallback_endpoint,
            model=fallback_model,
            reason="No Link devices available; using configured endpoint",
        )

    async def health_check(self, device: LinkDevice) -> bool:
        """Ping a device's endpoint and update its status.

        Measures round-trip latency and refreshes the loaded model list.

        Args:
            device: The device to check.

        Returns:
            True if the device is online and responding.
        """
        if not device.endpoint:
            device.online = False
            return False

        # Strip /v1 suffix for the base URL health check
        base_url = device.endpoint.rstrip("/")
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]

        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try /v1/models endpoint to get loaded models + measure latency
                resp = await client.get(f"{base_url}/v1/models")
                elapsed_ms = int((time.monotonic() - start) * 1000)

                if resp.status_code == 200:
                    device.online = True
                    device.latency_ms = elapsed_ms
                    data = resp.json()
                    models = data.get("data", [])
                    device.models_loaded = [m.get("id", "") for m in models if m.get("id")]
                    device.model_details = models
                    return True

            device.online = False
            return False

        except Exception as e:
            logger.debug(f"Health check failed for {device.display_name}: {e}")
            device.online = False
            device.latency_ms = -1
            return False

    def get_device_summary(self) -> list[dict]:
        """Return a JSON-serializable summary of all devices for the frontend.

        Returns:
            List of dicts with device status info for the LinkStatusPanel.
        """
        return [
            {
                "device_id": d.device_id,
                "display_name": d.display_name,
                "endpoint": d.endpoint,
                "online": d.online,
                "is_local": d.is_local,
                "models_loaded": d.models_loaded,
                "latency_ms": d.latency_ms,
                "hardware": d.hardware,
            }
            for d in self._devices
        ]

    # ── Private helpers ──────────────────────────────────────────────

    async def _probe_local(self) -> Optional[LinkDevice]:
        """Detect and probe the local LM Studio instance.

        Returns:
            LinkDevice for local instance if running, None otherwise.
        """
        local = LinkDevice(
            device_id="local",
            display_name="Local",
            endpoint=f"http://localhost:{_DEFAULT_PORT}/v1",
            is_local=True,
        )

        # Try to get device name from lms link status
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [str(_LMS_CLI), "link", "status", "--json"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                local.display_name = data.get("deviceName", "Local")
                local.device_id = data.get("deviceIdentifier", "local")
        except Exception as e:
            logger.debug(f"lms link status failed: {e}")

        # Probe loaded models
        await self.health_check(local)

        # Try to get detailed hardware info from lms ps
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [str(_LMS_CLI), "ps", "--json"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                models = json.loads(result.stdout)
                local.model_details = models
                # Extract model names from the detailed ps output
                local.models_loaded = [
                    m.get("identifier", m.get("modelKey", ""))
                    for m in models if m.get("identifier") or m.get("modelKey")
                ]
        except Exception as e:
            logger.debug(f"lms ps failed: {e}")

        return local

    async def _discover_link_peers(self) -> list[LinkDevice]:
        """Discover Link peers via ``lms link status --json``.

        Returns:
            List of LinkDevice objects for each discovered peer.
        """
        peers: list[LinkDevice] = []

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [str(_LMS_CLI), "link", "status", "--json"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                logger.debug(f"lms link status exited with {result.returncode}")
                return peers

            data = json.loads(result.stdout)
            for peer in data.get("peers", []):
                # Each peer has deviceIdentifier, deviceName, address
                addr = peer.get("address", "")
                if not addr:
                    continue

                # Build endpoint URL from peer address
                # Link peers expose their LM Studio on the same port
                endpoint = f"http://{addr}:{_DEFAULT_PORT}/v1"

                dev = LinkDevice(
                    device_id=peer.get("deviceIdentifier", ""),
                    display_name=peer.get("deviceName", addr),
                    endpoint=endpoint,
                    is_local=False,
                )
                peers.append(dev)

        except FileNotFoundError:
            logger.debug("lms CLI not found — Link peer discovery unavailable")
        except Exception as e:
            logger.debug(f"Link peer discovery failed: {e}")

        return peers

    def _get_static_endpoints(self) -> list[dict]:
        """Read static LM Studio endpoints from config.

        Returns:
            List of endpoint dicts from ``cfg["llm"]["link"]["static_endpoints"]``.

        Example config:
            >>> cfg = {"llm": {"link": {"static_endpoints": [
            ...     {"id": "gaming-pc", "name": "WHITE-TIMBER", "endpoint": "http://192.168.1.50:1234/v1"}
            ... ]}}}
        """
        return (
            self._cfg
            .get("llm", {})
            .get("link", {})
            .get("static_endpoints", [])
        )


async def get_hardware_info() -> dict:
    """Detect local hardware capabilities for model recommendation.

    Queries the local system for GPU, VRAM, RAM, and architecture info.
    Falls back to ``lms`` CLI if available, then platform-specific detection.

    Returns:
        Dict with keys: gpu, vram_gb, ram_gb, arch, backend, os.

    Example:
        >>> info = await get_hardware_info()
        >>> info
        {'gpu': 'Apple M2 Pro', 'vram_gb': 24.96, 'ram_gb': 32, 'arch': 'arm64', 'backend': 'mlx', 'os': 'darwin'}
    """
    import platform
    import os

    info: dict = {
        "gpu": "Unknown",
        "vram_gb": 0,
        "ram_gb": 0,
        "arch": platform.machine(),
        "backend": "unknown",
        "os": platform.system().lower(),
    }

    # Get total RAM
    try:
        if info["os"] == "darwin":
            result = await asyncio.to_thread(
                subprocess.run,
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                ram_bytes = int(result.stdout.strip())
                info["ram_gb"] = round(ram_bytes / (1024 ** 3))
        elif info["os"] == "linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        kb = int(line.split()[1])
                        info["ram_gb"] = round(kb / (1024 ** 2))
                        break
    except Exception:
        pass

    # Detect GPU
    try:
        if info["os"] == "darwin":
            # Apple Silicon: GPU is integrated, VRAM = ~78% of unified RAM
            result = await asyncio.to_thread(
                subprocess.run,
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                cpu_brand = result.stdout.strip()
                info["gpu"] = cpu_brand
                info["backend"] = "mlx"
                # Apple Silicon: ~75-78% of unified RAM usable as VRAM
                info["vram_gb"] = round(info["ram_gb"] * 0.78, 2)

        elif info["os"] in ("linux", "windows"):
            # Try nvidia-smi for NVIDIA GPUs
            result = await asyncio.to_thread(
                subprocess.run,
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                line = result.stdout.strip().split("\n")[0]
                parts = line.split(",")
                if len(parts) >= 2:
                    info["gpu"] = parts[0].strip()
                    vram_mb = int(parts[1].strip())
                    info["vram_gb"] = round(vram_mb / 1024, 1)
                    info["backend"] = "gguf"

    except FileNotFoundError:
        pass
    except Exception as e:
        logger.debug(f"GPU detection failed: {e}")

    return info


def match_hardware_tier(hardware: dict, recommendations: dict) -> Optional[dict]:
    """Match detected hardware to the best model recommendation tier.

    Args:
        hardware: Hardware info dict from ``get_hardware_info()``.
        recommendations: Parsed ``model_recommendations.json`` content.

    Returns:
        The matching tier dict from recommendations, or None.

    Example:
        >>> tier = match_hardware_tier({"vram_gb": 16, "backend": "gguf"}, recs)
        >>> tier["id"]
        'vram-16gb'
    """
    vram = hardware.get("vram_gb", 0)
    backend = hardware.get("backend", "unknown")

    for tier in recommendations.get("tiers", []):
        tier_backend = tier.get("backend", "any")

        # Match by backend first (mlx vs gguf)
        if tier_backend not in ("any", backend):
            continue

        # Match by VRAM range
        tier_id = tier["id"]
        if tier_id == "ultra-compact" and vram < 6:
            return tier
        elif tier_id == "vram-8gb" and 6 <= vram < 12:
            return tier
        elif tier_id == "vram-16gb" and 12 <= vram < 24:
            return tier
        elif tier_id == "unified-32gb" and backend == "mlx" and vram >= 18:
            return tier

    # Fallback: return the tier with largest models that fit
    for tier in reversed(recommendations.get("tiers", [])):
        if tier.get("backend", "any") in ("any", backend):
            return tier

    return None


def get_model_recommendation(vram_gb: float, use_case: str) -> list[dict]:
    """Recommend LLM models from the catalog that fit within a VRAM budget.

    Loads the bundled ``backend/data/model_catalog.json``, filters to models
    whose ``vram_gb`` requirement does not exceed ``vram_gb``, and sorts the
    results by how well they match the requested ``use_case``.

    Scoring logic (higher is better):
    - +3 if ``use_case`` exactly matches one of the model's ``recommended_for`` tags
    - +2 if any ``recommended_for`` tag starts with or contains the use_case word
    - Among equal scores, larger models (more parameters) are preferred
    - Ties are broken by VRAM headroom (more headroom = lower VRAM usage preferred)

    Supported use_case values (non-exhaustive):
        ``"roleplay"``, ``"anime"``, ``"companion"``, ``"coding"``,
        ``"general"``, ``"creative-writing"``, ``"vision"``

    Args:
        vram_gb: Maximum GPU VRAM available in gigabytes (e.g. ``8.0``).
        use_case: Desired use-case tag to optimise for.

    Returns:
        Up to 5 model dicts from the catalog, sorted best-first. Each dict
        contains all fields from the catalog entry. Returns an empty list if
        the catalog cannot be loaded or no models fit the constraint.

    Raises:
        Does not raise; errors are logged and an empty list is returned.

    Example:
        >>> recs = get_model_recommendation(8.0, "roleplay")
        >>> recs[0]["name"]
        'L3.1-8B-Stheno v3.4'
    """
    try:
        with _CATALOG_PATH.open("r", encoding="utf-8") as fh:
            catalog = json.load(fh)
    except FileNotFoundError:
        logger.warning("model_catalog.json not found at %s", _CATALOG_PATH)
        return []
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse model_catalog.json: %s", exc)
        return []

    llm_models: list[dict] = catalog.get("llm_models", [])

    # 1. Filter by VRAM constraint
    fitting = [m for m in llm_models if m.get("vram_gb", 9999) <= vram_gb]

    # 2. Score by use_case match
    use_case_lower = use_case.lower()

    def _score(model: dict) -> tuple[int, float, float]:
        """Return (match_score, param_weight, neg_vram) for sort key.

        Higher match_score is better. Within equal scores, prefer larger
        parameter counts (approximated from the ``parameters`` string).
        Ties are broken by preferring models with lower VRAM usage
        (more headroom relative to the budget).
        """
        recommended_for: list[str] = model.get("recommended_for", [])
        score = 0
        for tag in recommended_for:
            tag_lower = tag.lower()
            if tag_lower == use_case_lower:
                score += 3
            elif use_case_lower in tag_lower or tag_lower in use_case_lower:
                score += 2

        # Parse parameter count for secondary sort (e.g. "8B" → 8.0)
        param_str: str = model.get("parameters", "0B")
        try:
            param_count = float(param_str.upper().rstrip("B").rstrip("M"))
            if param_str.upper().endswith("M"):
                param_count /= 1000.0
        except ValueError:
            param_count = 0.0

        # Negative VRAM so that lower VRAM (more headroom) sorts last
        # when scores are equal — we prefer tighter fits of quality models
        neg_vram = -model.get("vram_gb", 0)

        return (score, param_count, neg_vram)

    fitting.sort(key=_score, reverse=True)

    return fitting[:5]
