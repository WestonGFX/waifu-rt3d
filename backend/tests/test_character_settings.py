"""Tests for character settings API endpoints.

Validates the PUT /api/characters/{id} endpoint and scan endpoints
that the Phase 3G SettingsModal relies on for background, VRM, and
Live2D model persistence.
"""
from pathlib import Path

import pytest


def test_character_update_background_url_and_mode(client):
    """PUT /api/characters/1 with background_url and background_mode persists correctly.

    Ensures the backend correctly stores per-character background settings
    that Phase 3G SettingsModal saves via charUpdates.
    """
    resp = client.put("/api/characters/1", json={
        "background_url": "/files/images/bg_test.jpg",
        "background_mode": "image"
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    chars = client.get("/api/characters").json()["characters"]
    char = next(c for c in chars if c["id"] == 1)
    assert char["background_url"] == "/files/images/bg_test.jpg"
    assert char["background_mode"] == "image"


def test_character_update_vrm_model_url(client):
    """PUT /api/characters/1 with vrm_model_url persists correctly.

    Ensures the VRM model URL column (added in schema v7) round-trips
    through PUT and GET.
    """
    resp = client.put("/api/characters/1", json={"vrm_model_url": "/files/avatars/test.vrm"})
    assert resp.status_code == 200
    chars = client.get("/api/characters").json()["characters"]
    char = next(c for c in chars if c["id"] == 1)
    assert char["vrm_model_url"] == "/files/avatars/test.vrm"


def test_character_get_returns_background_fields(client):
    """GET /api/characters returns background_url and background_mode fields.

    Verifies that the character list response includes the Phase 3G
    background fields so the SettingsModal can populate its form state.
    """
    chars = client.get("/api/characters").json()["characters"]
    assert len(chars) > 0
    char = chars[0]
    assert "background_url" in char
    assert "background_mode" in char
    assert "vrm_model_url" in char


def test_scan_vrm_returns_list(client, tmp_path, server_module, monkeypatch):
    """GET /api/scan/vrm returns model list from avatars storage dir.

    Uses monkeypatch to redirect STORAGE to a temp directory so the test
    controls exactly which .vrm files exist.
    """
    avatars_dir = tmp_path / "avatars"
    avatars_dir.mkdir()
    (avatars_dir / "test.vrm").write_bytes(b"fake-vrm")
    monkeypatch.setattr(server_module, "STORAGE", tmp_path)
    resp = client.get("/api/scan/vrm")
    assert resp.status_code == 200
    models = resp.json()["models"]
    assert any(m["file"] == "test.vrm" for m in models)


def test_scan_live2d_returns_list(client, tmp_path, server_module, monkeypatch):
    """GET /api/scan/live2d finds .model3.json files recursively.

    Verifies that the scan endpoint walks subdirectories, which is how
    Live2D model bundles are structured (e.g. live2d/ariu/ariu.model3.json).
    """
    live2d_dir = tmp_path / "live2d" / "ariu"
    live2d_dir.mkdir(parents=True)
    (live2d_dir / "ariu.model3.json").write_text("{}")
    monkeypatch.setattr(server_module, "STORAGE", tmp_path)
    resp = client.get("/api/scan/live2d")
    assert resp.status_code == 200
    models = resp.json()["models"]
    assert any(m["name"] == "ariu" for m in models)
