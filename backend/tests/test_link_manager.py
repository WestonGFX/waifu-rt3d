"""Tests for backend.llm.link_manager — Link device discovery and smart routing.

Uses mock devices to verify routing logic without requiring a live LM Studio
instance or Link network.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.llm.link_manager import (
    LinkDevice,
    LinkManager,
    RoutingDecision,
    match_hardware_tier,
)


def _make_device(
    device_id: str = "test",
    display_name: str = "Test Device",
    endpoint: str = "http://localhost:1234/v1",
    online: bool = True,
    models_loaded: list[str] | None = None,
    latency_ms: int = 10,
    is_local: bool = False,
) -> LinkDevice:
    """Create a test LinkDevice with sensible defaults."""
    return LinkDevice(
        device_id=device_id,
        display_name=display_name,
        endpoint=endpoint,
        online=online,
        models_loaded=models_loaded or [],
        latency_ms=latency_ms,
        is_local=is_local,
    )


class TestLinkDevice:
    """Tests for the LinkDevice dataclass."""

    def test_default_values(self):
        """New device should have sensible defaults."""
        d = LinkDevice()
        assert d.device_id == ""
        assert d.online is False
        assert d.models_loaded == []
        assert d.latency_ms == -1

    def test_custom_values(self):
        """Device fields should be settable."""
        d = _make_device(device_id="abc123", models_loaded=["model-a"])
        assert d.device_id == "abc123"
        assert "model-a" in d.models_loaded


class TestLinkManagerRouting:
    """Tests for LinkManager routing logic."""

    def setup_method(self):
        """Reset singleton before each test."""
        LinkManager.reset_instance()

    @pytest.mark.asyncio
    async def test_get_best_device_prefers_online(self):
        """Should only return online devices."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="offline", online=False),
            _make_device(device_id="online", online=True, latency_ms=5),
        ]

        best = await mgr.get_best_device("chat")
        assert best is not None
        assert best.device_id == "online"

    @pytest.mark.asyncio
    async def test_get_best_device_returns_none_when_empty(self):
        """Should return None when no devices available."""
        mgr = LinkManager.instance()
        mgr._devices = []
        mgr._last_refresh = 999999999999.0  # prevent refresh

        best = await mgr.get_best_device("chat")
        assert best is None

    @pytest.mark.asyncio
    async def test_get_best_device_prefers_model_match(self):
        """Should prefer devices that have the preferred model loaded."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="no-match", models_loaded=["other-model"], latency_ms=1),
            _make_device(device_id="match", models_loaded=["cydonia-24b"], latency_ms=50),
        ]

        best = await mgr.get_best_device("chat", preferred_model="cydonia-24b")
        assert best is not None
        assert best.device_id == "match"

    @pytest.mark.asyncio
    async def test_vision_routing_prefers_vl_models(self):
        """Vision routing should prefer devices with VL models loaded."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="chat-only", models_loaded=["cydonia-24b"], latency_ms=5),
            _make_device(device_id="vision", models_loaded=["qwen3-vl-8b"], latency_ms=20),
        ]

        best = await mgr.get_best_device("vision")
        assert best is not None
        assert best.device_id == "vision"

    @pytest.mark.asyncio
    async def test_tts_routing_prefers_local(self):
        """TTS routing should prefer the local device for lowest latency."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="remote", is_local=False, latency_ms=5),
            _make_device(device_id="local", is_local=True, latency_ms=10),
        ]

        best = await mgr.get_best_device("tts")
        assert best is not None
        assert best.device_id == "local"

    @pytest.mark.asyncio
    async def test_route_returns_decision(self):
        """Route should return a RoutingDecision with all fields populated."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="main", models_loaded=["rpmax-12b"], latency_ms=5),
        ]
        mgr._last_refresh = 999999999999.0

        decision = await mgr.route(
            "chat",
            fallback_endpoint="http://localhost:1234/v1",
            fallback_model="fallback-model",
        )

        assert isinstance(decision, RoutingDecision)
        assert decision.device is not None
        assert decision.endpoint == "http://localhost:1234/v1"
        assert decision.model == "rpmax-12b"
        assert "main" in decision.reason

    @pytest.mark.asyncio
    async def test_route_uses_fallback_when_no_devices(self):
        """Route should use fallback when no devices are online."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="offline", online=False),
        ]
        mgr._last_refresh = 999999999999.0

        decision = await mgr.route(
            "chat",
            fallback_endpoint="http://fallback:1234/v1",
            fallback_model="fallback-model",
        )

        assert decision.device is None
        assert decision.endpoint == "http://fallback:1234/v1"
        assert decision.model == "fallback-model"
        assert "fallback" in decision.reason.lower() or "No Link" in decision.reason

    def test_get_device_summary(self):
        """Summary should return JSON-serializable dicts."""
        mgr = LinkManager.instance()
        mgr._devices = [
            _make_device(device_id="test", models_loaded=["model-a"]),
        ]

        summary = mgr.get_device_summary()
        assert len(summary) == 1
        assert summary[0]["device_id"] == "test"
        assert summary[0]["models_loaded"] == ["model-a"]
        assert isinstance(summary[0]["online"], bool)

    def test_singleton_pattern(self):
        """Instance should return the same object."""
        a = LinkManager.instance()
        b = LinkManager.instance()
        assert a is b

    def test_reset_instance(self):
        """Reset should clear the singleton."""
        a = LinkManager.instance()
        LinkManager.reset_instance()
        b = LinkManager.instance()
        assert a is not b


class TestMatchHardwareTier:
    """Tests for match_hardware_tier()."""

    RECS = {
        "tiers": [
            {"id": "ultra-compact", "label": "Ultra-Compact", "backend": "any", "models": []},
            {"id": "vram-8gb", "label": "8GB", "backend": "gguf", "models": []},
            {"id": "vram-16gb", "label": "16GB", "backend": "gguf", "models": []},
            {"id": "unified-32gb", "label": "32GB Unified", "backend": "mlx", "models": []},
        ]
    }

    def test_matches_8gb_tier(self):
        """8GB VRAM should match the vram-8gb tier."""
        hw = {"vram_gb": 8, "backend": "gguf"}
        tier = match_hardware_tier(hw, self.RECS)
        assert tier is not None
        assert tier["id"] == "vram-8gb"

    def test_matches_16gb_tier(self):
        """16GB VRAM should match the vram-16gb tier."""
        hw = {"vram_gb": 16, "backend": "gguf"}
        tier = match_hardware_tier(hw, self.RECS)
        assert tier is not None
        assert tier["id"] == "vram-16gb"

    def test_matches_mlx_tier(self):
        """Apple Silicon with MLX backend should match unified-32gb."""
        hw = {"vram_gb": 24.96, "backend": "mlx"}
        tier = match_hardware_tier(hw, self.RECS)
        assert tier is not None
        assert tier["id"] == "unified-32gb"

    def test_ultra_compact_for_tiny_vram(self):
        """Very low VRAM should match ultra-compact."""
        hw = {"vram_gb": 4, "backend": "gguf"}
        tier = match_hardware_tier(hw, self.RECS)
        assert tier is not None
        assert tier["id"] == "ultra-compact"

    def test_empty_recommendations(self):
        """Empty recommendations should return None."""
        hw = {"vram_gb": 16, "backend": "gguf"}
        tier = match_hardware_tier(hw, {})
        assert tier is None
