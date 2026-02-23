"""Tests for Phase 9: Capability-Aware Characters.

Unit tests for ``_estimate_model_tier()`` and ``_TIER_RANK``, plus
integration tests for capability profile CRUD and chat override behavior.
"""

import json

import pytest


# ── Unit Tests: _estimate_model_tier ────────────────────────────────

class TestEstimateModelTier:
    """Test the model tier estimation heuristic."""

    @pytest.fixture(autouse=True)
    def _import_tier_fn(self, server_module):
        """Import the function under test from the monkeypatched server."""
        self._estimate = server_module._estimate_model_tier
        self._rank = server_module._TIER_RANK

    def test_tiny_models(self):
        """Models with <=3B parameters should be 'tiny'."""
        assert self._estimate("phi-3-mini-3b") == "tiny"
        assert self._estimate("tinyllama-1.1b-chat") == "tiny"
        assert self._estimate("stablelm-2-1.6b") == "tiny"
        assert self._estimate("qwen2-0.5b") == "tiny"

    def test_small_models(self):
        """Models with 3-7B parameters should be 'small'."""
        assert self._estimate("llama-3.1-7b-instruct") == "small"
        assert self._estimate("mistral-7b-instruct-v0.3") == "small"
        assert self._estimate("qwen3-4b-q4_k_m") == "small"

    def test_medium_models(self):
        """Models with 7-14B parameters should be 'medium'."""
        assert self._estimate("qwen3-8b-instruct-q4") == "medium"
        assert self._estimate("gemma-3-12b-it") == "medium"
        assert self._estimate("llama-3.1-14b") == "medium"

    def test_large_models(self):
        """Models with 14-32B parameters should be 'large'."""
        assert self._estimate("gemma-3-27b-it") == "large"
        assert self._estimate("qwen3-32b-instruct") == "large"
        assert self._estimate("deepseek-v2-lite-16b") == "large"

    def test_xl_models(self):
        """Models with >32B parameters should be 'xl'."""
        assert self._estimate("llama-3.1-70b-instruct") == "xl"
        assert self._estimate("qwen-2.5-72b") == "xl"
        assert self._estimate("deepseek-r1-671b") == "xl"

    def test_unknown_no_param_count(self):
        """Models without a recognizable parameter count should be 'unknown'."""
        assert self._estimate("gpt-4o") == "unknown"
        assert self._estimate("claude-3-sonnet") == "unknown"
        assert self._estimate("custom-model") == "unknown"

    def test_fractional_params(self):
        """Models with fractional param counts (e.g. 1.5b) parse correctly."""
        assert self._estimate("stablelm-2-1.6b") == "tiny"
        assert self._estimate("phi-3.5-mini-3.8b") == "small"

    def test_case_insensitive(self):
        """Model name matching should be case-insensitive."""
        assert self._estimate("Qwen3-8B-Instruct") == "medium"
        assert self._estimate("LLAMA-3.1-70B") == "xl"

    def test_tier_rank_ordering(self):
        """_TIER_RANK should have consistent ordering from tiny to xl."""
        assert self._rank["tiny"] < self._rank["small"]
        assert self._rank["small"] < self._rank["medium"]
        assert self._rank["medium"] < self._rank["large"]
        assert self._rank["large"] < self._rank["xl"]

    def test_unknown_rank_is_medium(self):
        """Unknown tier should rank as medium (safe middle ground)."""
        assert self._rank["unknown"] == self._rank["medium"]


# ── Integration Tests: Capability Profile CRUD ──────────────────────

class TestCapabilityProfileCRUD:
    """Test capability profile persistence through character API endpoints."""

    SAMPLE_PROFILE = {
        "model_tier": "large",
        "context_budget": 16384,
        "repeat_penalty": 1.2,
        "frequency_penalty": 0.5,
        "max_tokens": 2048,
        "supports_tools": True,
        "supports_thinking": True,
        "supports_vision": False,
        "prompt_style": "minimal",
        "notes": "Tuned for Gemma-3-12b Q4 on RTX 5080",
    }

    def test_create_character_with_capability_profile(self, client):
        """POST /api/characters with capability_profile persists correctly."""
        resp = client.post("/api/characters", json={
            "name": "CapTest",
            "system_prompt": "You are a test character.",
            "capability_profile": self.SAMPLE_PROFILE,
        })
        assert resp.status_code == 200
        data = resp.json()
        # POST /api/characters returns the created character dict (not {"ok": True})
        assert "id" in data
        assert data["name"] == "CapTest"

        # Verify it round-trips through GET
        chars = client.get("/api/characters").json()["characters"]
        char = next(c for c in chars if c["name"] == "CapTest")
        cap = char.get("capability_profile")
        assert cap is not None

        # Parse if it's a string
        if isinstance(cap, str):
            cap = json.loads(cap)

        assert cap["model_tier"] == "large"
        assert cap["context_budget"] == 16384
        assert cap["repeat_penalty"] == 1.2
        assert cap["max_tokens"] == 2048
        assert cap["supports_tools"] is True
        assert cap["prompt_style"] == "minimal"

    def test_update_character_capability_profile(self, client):
        """PUT /api/characters/1 with capability_profile updates correctly."""
        profile = {"model_tier": "small", "context_budget": 4096, "max_tokens": 512}
        resp = client.put("/api/characters/1", json={
            "capability_profile": profile,
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify persistence
        chars = client.get("/api/characters").json()["characters"]
        char = next(c for c in chars if c["id"] == 1)
        cap = char.get("capability_profile")
        if isinstance(cap, str):
            cap = json.loads(cap)
        assert cap["model_tier"] == "small"
        assert cap["context_budget"] == 4096

    def test_character_without_capability_profile(self, client):
        """Characters without a capability profile return None/null."""
        chars = client.get("/api/characters").json()["characters"]
        char = next(c for c in chars if c["id"] == 1)
        # Default character has no capability profile set
        cap = char.get("capability_profile")
        assert cap is None or cap == "" or cap == "{}"

    def test_empty_capability_profile_is_valid(self, client):
        """An empty capability_profile dict should persist without error."""
        resp = client.put("/api/characters/1", json={
            "capability_profile": {},
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


# ── Integration Tests: Capability Override Behavior ─────────────────

class TestCapabilityOverrides:
    """Test that capability profile settings affect the chat pipeline."""

    def test_capability_warning_on_tier_mismatch(self, client, server_module, monkeypatch):
        """Chat with a character requiring 'xl' tier shows a warning when
        the loaded model is only 'small'.

        The non-streaming /api/chat endpoint returns ``capability_warning``
        when the character's model_tier exceeds the detected tier of the
        currently loaded model.
        """
        # Set character to require xl tier
        profile = {"model_tier": "xl", "context_budget": 8192}
        client.put("/api/characters/1", json={"capability_profile": profile})

        # Configure a small model name in config (4b → 'small' tier)
        test_config = {
            "llm": {
                "provider": "stub",
                "model": "qwen3-4b-instruct",
                "endpoint": "http://stub.local",
                "api_key": "stub-key",
            },
            "memory": {"max_history": 12},
            "tts": {"provider": "stub"},
        }
        monkeypatch.setattr(server_module, "load_config", lambda: test_config.copy())

        # Create a session first
        session_resp = client.post("/api/sessions", json={"title": "test"})
        session_id = session_resp.json().get("session_id", 1)

        # Send a chat (non-streaming)
        resp = client.post("/api/chat", json={
            "text": "Hello!",
            "session_id": session_id,
            "char_id": 1,
        })
        data = resp.json()
        assert data.get("ok") is True, f"Chat failed: {data}"

        # Warning should exist because xl > small
        warning = data.get("capability_warning")
        assert warning is not None, \
            f"Expected capability_warning for xl tier with 4b model, got: {data}"
        assert "xl" in warning.lower()
        assert "small" in warning.lower()

    def test_no_capability_warning_when_tier_matches(self, client, server_module, monkeypatch):
        """No capability_warning when the loaded model meets the required tier."""
        # Set character to require 'small' tier
        profile = {"model_tier": "small"}
        client.put("/api/characters/1", json={"capability_profile": profile})

        # Configure a large model (70b → 'xl' tier, exceeds 'small')
        test_config = {
            "llm": {
                "provider": "stub",
                "model": "llama-3.1-70b-instruct",
                "endpoint": "http://stub.local",
                "api_key": "stub-key",
            },
            "memory": {"max_history": 12},
            "tts": {"provider": "stub"},
        }
        monkeypatch.setattr(server_module, "load_config", lambda: test_config.copy())

        session_resp = client.post("/api/sessions", json={"title": "test2"})
        session_id = session_resp.json().get("session_id", 1)

        resp = client.post("/api/chat", json={
            "text": "Hello!",
            "session_id": session_id,
            "char_id": 1,
        })
        data = resp.json()
        assert data.get("ok") is True, f"Chat failed: {data}"
        assert data.get("capability_warning") is None
