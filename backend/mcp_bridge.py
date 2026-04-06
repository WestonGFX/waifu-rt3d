"""FastMCP bridge — exposes key waifu-rt3d API endpoints as MCP tools.

This lets Claude Code query the running backend directly as native tool calls
instead of writing curl commands. Requires the backend server to be running
on localhost:8080.

Usage:
    .venv/bin/python -m backend.mcp_bridge

Add to .mcp.json:
    "waifu-rt3d-api": {
        "command": ".venv/bin/python",
        "args": ["-m", "backend.mcp_bridge"]
    }
"""

from __future__ import annotations

import json
import logging
from typing import Any

import requests

try:
    from fastmcp import FastMCP
except ImportError:
    raise SystemExit(
        "fastmcp not installed. Run: .venv/bin/pip install fastmcp"
    )

logger = logging.getLogger(__name__)

BASE_URL = "http://localhost:8080"

mcp = FastMCP("waifu-rt3d")


def _get(path: str, params: dict[str, Any] | None = None) -> dict:
    """Make a GET request to the backend API.

    Args:
        path: API path (e.g., '/api/characters').
        params: Optional query parameters.

    Returns:
        Parsed JSON response.

    Raises:
        requests.ConnectionError: If the backend is not running.
    """
    try:
        resp = requests.get(f"{BASE_URL}{path}", params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.ConnectionError:
        return {"error": "Backend not running. Start with: ./run.sh"}
    except requests.HTTPError as e:
        return {"error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}


def _post(path: str, data: dict[str, Any] | None = None) -> dict:
    """Make a POST request to the backend API.

    Args:
        path: API path (e.g., '/api/chat').
        data: JSON body to send.

    Returns:
        Parsed JSON response.

    Raises:
        requests.ConnectionError: If the backend is not running.
    """
    try:
        resp = requests.post(f"{BASE_URL}{path}", json=data, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.ConnectionError:
        return {"error": "Backend not running. Start with: ./run.sh"}
    except requests.HTTPError as e:
        return {"error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}


# ── Health & Status ──────────────────────────────────────────────


@mcp.tool()
def health_check() -> dict:
    """Check if the backend server is running and healthy.

    Returns:
        Health status including version, DB connection, LLM status,
        memory usage, and audio cache stats.

    Example:
        >>> health_check()
        {"ok": true, "version": "5.34.0", "services": {...}}
    """
    return _get("/api/health")


# ── Characters ───────────────────────────────────────────────────


@mcp.tool()
def list_characters() -> dict:
    """List all characters with their IDs, names, and metadata.

    Returns:
        List of character objects with id, name, greeting, persona summary.

    Example:
        >>> list_characters()
        [{"id": 1, "name": "Hana", ...}, {"id": 2, "name": "Mika", ...}]
    """
    return _get("/api/characters")


@mcp.tool()
def get_character(character_id: int) -> dict:
    """Get detailed info for a specific character.

    Args:
        character_id: The character's database ID.

    Returns:
        Full character record including persona, greeting, traits, tier prompts.

    Example:
        >>> get_character(1)
        {"id": 1, "name": "Hana", "persona": "...", ...}
    """
    return _get(f"/api/characters/{character_id}")


@mcp.tool()
def get_character_timeline(character_id: int) -> dict:
    """Get a character's relationship timeline (milestones, diary, affinity).

    Args:
        character_id: The character's database ID.

    Returns:
        Timeline entries sorted by date, including milestones, diary entries,
        and affinity unlock events.

    Example:
        >>> get_character_timeline(1)
        {"timeline": [{"type": "milestone", "date": "...", ...}]}
    """
    return _get(f"/api/characters/{character_id}/timeline")


# ── Messages & Chat ──────────────────────────────────────────────


@mcp.tool()
def get_messages(character_id: int, limit: int = 20) -> dict:
    """Get recent messages for a character's active chat session.

    Args:
        character_id: The character's database ID.
        limit: Max messages to return (default 20).

    Returns:
        List of message objects with role, content, timestamp.

    Example:
        >>> get_messages(1, limit=5)
        {"messages": [{"role": "user", "content": "hi", ...}]}
    """
    return _get(f"/api/characters/{character_id}/messages", {"limit": limit})


@mcp.tool()
def get_sessions(character_id: int) -> dict:
    """List all chat sessions for a character.

    Args:
        character_id: The character's database ID.

    Returns:
        List of sessions with id, title, message_count, created_at.

    Example:
        >>> get_sessions(1)
        [{"id": 1, "title": "First Chat", "message_count": 42, ...}]
    """
    return _get(f"/api/characters/{character_id}/sessions")


# ── Mood & Adaptive Intelligence ─────────────────────────────────


@mcp.tool()
def get_mood(character_id: int) -> dict:
    """Get the current mood state for a character.

    Args:
        character_id: The character's database ID.

    Returns:
        Mood object with emotion, intensity, time_of_day state, and
        contributing factors.

    Example:
        >>> get_mood(1)
        {"emotion": "happy", "intensity": 0.7, "time_state": "evening", ...}
    """
    return _get(f"/api/characters/{character_id}/mood")


@mcp.tool()
def get_analytics(character_id: int) -> dict:
    """Get analytics and stats for a character's interaction history.

    Args:
        character_id: The character's database ID.

    Returns:
        Analytics object with message counts, session stats, emotion
        distribution, engagement metrics.

    Example:
        >>> get_analytics(1)
        {"total_messages": 1234, "avg_session_length": 45, ...}
    """
    return _get(f"/api/characters/{character_id}/analytics")


# ── Configuration ────────────────────────────────────────────────


@mcp.tool()
def get_config() -> dict:
    """Get the current application configuration.

    Returns:
        Config object with LLM settings, voice settings, UI preferences,
        content filter state, and feature flags.

    Example:
        >>> get_config()
        {"llm_provider": "lm-studio", "theme": "sakura-dark", ...}
    """
    return _get("/api/config")


@mcp.tool()
def get_models() -> dict:
    """List available LLM models from the configured provider.

    Returns:
        List of model objects with id, name, size, and capabilities.

    Example:
        >>> get_models()
        [{"id": "gemma-3-12b", "name": "Gemma 3 12B", ...}]
    """
    return _get("/api/models")


# ── Content & Features ───────────────────────────────────────────


@mcp.tool()
def get_memories(character_id: int, limit: int = 10) -> dict:
    """Get stored memories for a character (tiered memory system).

    Args:
        character_id: The character's database ID.
        limit: Max memories to return (default 10).

    Returns:
        List of memory objects with content, importance, tier, timestamp.

    Example:
        >>> get_memories(1, limit=5)
        [{"content": "User likes cats", "importance": 0.8, "tier": "core"}]
    """
    return _get(f"/api/characters/{character_id}/memories", {"limit": limit})


@mcp.tool()
def get_knowledge(character_id: int) -> dict:
    """Get extracted knowledge facts about the user for a character.

    Args:
        character_id: The character's database ID.

    Returns:
        Knowledge graph entries: facts the character has learned about the user.

    Example:
        >>> get_knowledge(1)
        [{"fact": "User works in tech", "confidence": 0.9, ...}]
    """
    return _get(f"/api/characters/{character_id}/knowledge")


if __name__ == "__main__":
    mcp.run()
