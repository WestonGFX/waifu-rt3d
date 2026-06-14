"""Tests for the Stage 2a character environment endpoints.

Covers ``GET`` / ``PUT /api/characters/{char_id}/environment`` — the static 3D
location (room/cafe GLB) rendered behind the avatar. Uses the shared ``client``
fixture (TestClient over a fresh v89 schema) plus a directly-inserted character.
"""

from __future__ import annotations

import sqlite3

import pytest


@pytest.fixture()
def char_id(server_module) -> int:
    """Insert a bare character into the test DB and return its id."""
    con = sqlite3.connect(server_module.DB_PATH)
    try:
        con.execute("INSERT INTO characters (name) VALUES (?)", ("RoomChan",))
        cid = con.execute("SELECT last_insert_rowid()").fetchone()[0]
        con.commit()
    finally:
        con.close()
    return cid


def test_environment_defaults_to_null(client, char_id):
    """A fresh character has no environment (null)."""
    resp = client.get(f"/api/characters/{char_id}/environment")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["environment_url"] is None


def test_set_then_get_environment(client, char_id):
    """Setting an environment URL persists and reads back."""
    url = "/files/environments/cozy_room.glb"
    put = client.put(f"/api/characters/{char_id}/environment", json={"environment_url": url})
    assert put.status_code == 200
    assert put.json() == {"ok": True, "environment_url": url}

    got = client.get(f"/api/characters/{char_id}/environment")
    assert got.json()["environment_url"] == url


def test_clear_environment_with_null(client, char_id):
    """Passing null clears a previously-set environment."""
    client.put(
        f"/api/characters/{char_id}/environment",
        json={"environment_url": "/files/environments/cafe.glb"},
    )
    cleared = client.put(f"/api/characters/{char_id}/environment", json={"environment_url": None})
    assert cleared.status_code == 200
    assert cleared.json()["environment_url"] is None
    assert client.get(f"/api/characters/{char_id}/environment").json()["environment_url"] is None


def test_missing_body_field_clears(client, char_id):
    """An empty body (no environment_url key) defaults to None (clear)."""
    client.put(
        f"/api/characters/{char_id}/environment",
        json={"environment_url": "/files/environments/x.glb"},
    )
    resp = client.put(f"/api/characters/{char_id}/environment", json={})
    assert resp.status_code == 200
    assert resp.json()["environment_url"] is None


def test_get_unknown_character_404(client):
    """Unknown character id returns 404 on GET."""
    assert client.get("/api/characters/999999/environment").status_code == 404


def test_put_unknown_character_404(client):
    """Unknown character id returns 404 on PUT."""
    resp = client.put(
        "/api/characters/999999/environment",
        json={"environment_url": "/files/environments/x.glb"},
    )
    assert resp.status_code == 404
