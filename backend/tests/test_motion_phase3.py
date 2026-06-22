"""Tests for Stage 3 Phase 3 — the DART clip-artifact motion contract.

Covers both ends of the live path that can be exercised without the GPU box:

  * motion_server (box side): emotion→prompt + duration→primitives mapping, the
    /status `dart` capability flag, the procedural `kind:"keyframes"` shape, and
    the DART `/generate` branch (clip artifact + base64 round-trip + cache) using
    a fake resident runner.
  * remote_client (Mac side): the npz→GLB conversion (`_convert_clip_npz_to_glb`)
    against a synthetic DART-shaped npz, including the content-hash dedup.

The real DART engine + the live HTTP round-trip are box-only and verified
separately; these lock the contract logic so a refactor can't silently break it.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import backend.motion.motion_server as ms
import backend.motion.remote_client as rc


# ─── Synthetic DART npz (mirrors test_dart_to_glb.make_npz) ───────────────────

def _make_dart_npz_bytes(frames: int = 6, fps: int = 30) -> bytes:
    """Build minimal DART-shaped SMPL-X npz bytes (rest pose) for conversion tests."""
    import io

    poses = np.zeros((frames, 165), dtype=np.float32)
    buf = io.BytesIO()
    np.savez(
        buf,
        poses=poses,
        trans=np.zeros((frames, 3), dtype=np.float32),
        betas=np.zeros(10, dtype=np.float32),
        gender="male",
        mocap_framerate=np.int64(fps),
    )
    return buf.getvalue()


# ─── motion_server: mapping helpers ───────────────────────────────────────────

def test_emotion_to_prompt_known_and_unknown():
    assert ms._emotion_to_prompt("happy") == "wave"
    assert ms._emotion_to_prompt("excited") == "jump for joy"
    # Unknown emotion falls back to a safe neutral action.
    assert ms._emotion_to_prompt("zzz_unknown") == "stand"


def test_duration_to_primitives_bounds():
    assert ms._duration_to_primitives(2.2) == 8          # the calibrated cadence
    assert ms._duration_to_primitives(0.1) == 2          # clamped low
    assert ms._duration_to_primitives(100.0) == 24       # clamped high
    assert isinstance(ms._duration_to_primitives(3.0), int)


# ─── motion_server: /status + procedural shape ────────────────────────────────

def test_status_advertises_dart_flag():
    body = ms.get_status()
    assert "dart" in body
    assert body["dart"] is False           # no runner loaded in tests
    assert body["procedural"] is True


def test_generate_procedural_is_tagged_keyframes():
    client = TestClient(ms.app)
    r = client.post("/generate", json={"emotion": "happy", "duration": 2.0})
    assert r.status_code == 200
    data = r.json()
    assert data["kind"] == "keyframes"
    assert data["backend"] == "procedural"
    assert isinstance(data["keyframes"], list) and data["keyframes"]


# ─── motion_server: DART /generate branch (fake resident runner) ──────────────

class _FakeRunner:
    """Stand-in for DartRunner: writes a synthetic npz, counts generate() calls."""

    def __init__(self, tmp: Path) -> None:
        self.tmp = tmp
        self.calls = 0

    def generate(self, prompt: str, *, primitives: int = 8, seed: int = 0) -> Path:
        self.calls += 1
        p = self.tmp / f"{prompt}_{primitives}_{seed}.npz"
        p.write_bytes(_make_dart_npz_bytes())
        return p


@pytest.fixture
def _dart_active(tmp_path, monkeypatch):
    """Activate the DART backend with a fake runner and a clean cache."""
    runner = _FakeRunner(tmp_path)
    monkeypatch.setattr(ms, "_ai_backend", "dart")
    monkeypatch.setattr(ms, "_dart_runner", runner)
    monkeypatch.setattr(ms, "_dart_cache", {})
    return runner


def test_generate_dart_returns_clip_artifact(_dart_active):
    client = TestClient(ms.app)
    r = client.post("/generate", json={"emotion": "happy", "duration": 2.2})
    assert r.status_code == 200
    data = r.json()
    assert data["kind"] == "clip"
    assert data["format"] == "npz"
    assert data["backend"] == "dart"
    assert data["prompt"] == "wave"          # happy → wave via emotion map
    assert data["fps"] == 30
    # base64 payload decodes to a real npz with the expected arrays.
    raw = base64.b64decode(data["npz_b64"])
    npz = np.load(__import__("io").BytesIO(raw))
    assert "poses" in npz and "trans" in npz


def test_generate_dart_explicit_prompt_overrides_emotion(_dart_active):
    client = TestClient(ms.app)
    r = client.post("/generate", json={"emotion": "happy", "prompt": "spin around", "duration": 2.2})
    assert r.json()["prompt"] == "spin around"


def test_generate_dart_caches_by_key(_dart_active):
    client = TestClient(ms.app)
    body = {"emotion": "happy", "duration": 2.2, "seed": 0}
    client.post("/generate", json=body)
    client.post("/generate", json=body)
    # Second identical request is served from cache — runner called once.
    assert _dart_active.calls == 1


def test_generate_dart_failure_falls_back_to_procedural(tmp_path, monkeypatch):
    class _Boom:
        def generate(self, *a, **k):
            raise RuntimeError("cuda exploded")

    monkeypatch.setattr(ms, "_ai_backend", "dart")
    monkeypatch.setattr(ms, "_dart_runner", _Boom())
    monkeypatch.setattr(ms, "_dart_cache", {})
    client = TestClient(ms.app)
    r = client.post("/generate", json={"emotion": "happy", "duration": 2.0})
    assert r.status_code == 200
    # Graceful degradation to procedural keyframes.
    assert r.json()["kind"] == "keyframes"
    assert r.json()["backend"] == "procedural"


# ─── remote_client: Mac-side npz → GLB conversion ─────────────────────────────

def test_safe_stem_sanitizes():
    assert rc._safe_stem("motion_happy!!") == "motion_happy"
    assert rc._safe_stem("Wave Hello 2") == "wave_hello_2"
    assert rc._safe_stem("") == "clip"
    assert rc._safe_stem("***") == "clip"


def test_convert_clip_npz_to_glb_writes_glb(tmp_path, monkeypatch):
    # Redirect the output dir into the tmp sandbox.
    gen_dir = tmp_path / "dart-generated"
    monkeypatch.setattr(rc, "_DART_GEN_DIR", gen_dir)
    npz_b64 = base64.b64encode(_make_dart_npz_bytes()).decode("ascii")

    url = rc._convert_clip_npz_to_glb(npz_b64, "motion_happy")
    assert url.startswith(rc._DART_GEN_URL_BASE + "/motion_happy_")
    assert url.endswith(".glb")
    glb = gen_dir / Path(url).name
    assert glb.exists() and glb.stat().st_size > 100
    # The intermediate npz is cleaned up — only the GLB remains.
    assert not list(gen_dir.glob("*.npz"))


def test_convert_clip_npz_dedups_identical_motion(tmp_path, monkeypatch):
    gen_dir = tmp_path / "dart-generated"
    monkeypatch.setattr(rc, "_DART_GEN_DIR", gen_dir)
    npz_b64 = base64.b64encode(_make_dart_npz_bytes()).decode("ascii")

    url1 = rc._convert_clip_npz_to_glb(npz_b64, "idle")
    url2 = rc._convert_clip_npz_to_glb(npz_b64, "idle")
    assert url1 == url2                       # same content hash → same file
    assert len(list(gen_dir.glob("*.glb"))) == 1


def test_convert_clip_npz_empty_payload_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(rc, "_DART_GEN_DIR", tmp_path / "dart-generated")
    with pytest.raises(ValueError):
        rc._convert_clip_npz_to_glb("", "x")
