"""Tests for cloud-vs-local send detection (privacy routing, schema v88).

`is_cloud_send` decides whether a turn's memory context may include private
memories. Provider name alone is ambiguous (openai_compat serves both local
LM Studio and cloud OpenRouter), so the endpoint host breaks the tie.
"""
from __future__ import annotations

from backend.llm.context_assembler import is_cloud_send


class TestIsCloudSend:
    def test_named_cloud_providers_are_cloud(self):
        for p in ("claude", "anthropic", "gemini", "openai", "openrouter"):
            assert is_cloud_send({"llm": {"provider": p}}) is True, p

    def test_named_local_providers_are_local(self):
        for p in ("ollama", "lmstudio", "lmstudio_rest", "koboldcpp", "peft_local"):
            assert is_cloud_send({"llm": {"provider": p}}) is False, p

    def test_openai_compat_localhost_is_local(self):
        assert is_cloud_send(
            {"llm": {"provider": "openai_compat", "endpoint": "http://localhost:1234/v1"}}
        ) is False

    def test_openai_compat_lan_is_local(self):
        assert is_cloud_send(
            {"llm": {"provider": "openai_compat", "endpoint": "http://192.168.1.50:1234/v1"}}
        ) is False

    def test_openai_compat_remote_is_cloud(self):
        assert is_cloud_send(
            {"llm": {"provider": "openai_compat", "endpoint": "https://openrouter.ai/api/v1"}}
        ) is True

    def test_empty_config_defaults_local(self):
        # Local-first app: an unconfigured endpoint is not treated as cloud.
        assert is_cloud_send({}) is False
        assert is_cloud_send({"llm": {}}) is False

    def test_case_insensitive_provider(self):
        assert is_cloud_send({"llm": {"provider": "Claude"}}) is True
