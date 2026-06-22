"""Tests for the pre-baked DART gesture library (manifest + builder).

Locks the manifest schema (so a typo can't silently break embodiment wiring) and
the builder's npz -> GLB plumbing.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "tools"))

from tools.build_dart_gestures import build, _MANIFEST  # noqa: E402
from tools.dart_to_glb import POSE_DIM  # noqa: E402


def _manifest() -> dict:
    return json.loads(_MANIFEST.read_text())


class TestManifestSchema:
    def test_manifest_exists_and_parses(self):
        m = _manifest()
        assert m["version"] >= 1
        assert m["clip_dir"] and m["url_base"]
        assert isinstance(m["gestures"], list) and len(m["gestures"]) >= 1

    def test_every_gesture_well_formed(self):
        for g in _manifest()["gestures"]:
            assert g["name"] and isinstance(g["name"], str)
            assert g["prompt"] and isinstance(g["prompt"], str)
            assert isinstance(g["primitives"], int) and g["primitives"] > 0
            assert isinstance(g["triggers"], list) and g["triggers"], g["name"]

    def test_gesture_names_unique(self):
        names = [g["name"] for g in _manifest()["gestures"]]
        assert len(names) == len(set(names))

    def test_triggers_unique_across_gestures(self):
        """A trigger label must map to exactly one gesture (deterministic playback)."""
        seen: dict[str, str] = {}
        for g in _manifest()["gestures"]:
            for t in g["triggers"]:
                assert t not in seen, f"trigger '{t}' on both {seen.get(t)} and {g['name']}"
                seen[t] = g["name"]


class TestBuilder:
    def _stage(self, tmp_path: Path, names: list[str]) -> Path:
        npz_dir = tmp_path / "npz"
        npz_dir.mkdir()
        rng = np.random.default_rng(0)
        for n in names:
            np.savez(
                npz_dir / f"{n}.npz",
                poses=(rng.standard_normal((10, POSE_DIM)) * 0.3).astype(np.float32),
                trans=np.zeros((10, 3), dtype=np.float32),
                betas=np.zeros(10, dtype=np.float32),
                gender="male",
                mocap_framerate=np.int64(30),
            )
        return npz_dir

    def test_build_only_subset(self, tmp_path, monkeypatch):
        # Redirect the manifest's clip_dir into tmp so we don't write into the repo.
        m = _manifest()
        first = m["gestures"][0]["name"]
        npz_dir = self._stage(tmp_path, [first])
        # Patch clip_dir via a temp manifest copy.
        m["clip_dir"] = str((tmp_path / "out").relative_to(_ROOT)) if str(tmp_path).startswith(str(_ROOT)) else "backend/storage/animations/_test_gestures"
        tmp_manifest = tmp_path / "manifest.json"
        tmp_manifest.write_text(json.dumps(m))
        monkeypatch.setattr("tools.build_dart_gestures._MANIFEST", tmp_manifest)
        results = build(npz_dir, only={first})
        assert len(results) == 1 and results[0]["status"] == "ok"
        assert (_ROOT / m["clip_dir"] / f"{first}.glb").exists()
        # cleanup
        (_ROOT / m["clip_dir"] / f"{first}.glb").unlink()

    def test_missing_npz_reported_not_raised(self, tmp_path, monkeypatch):
        m = _manifest()
        name = m["gestures"][0]["name"]
        m["clip_dir"] = "backend/storage/animations/_test_gestures2"
        tmp_manifest = tmp_path / "manifest.json"
        tmp_manifest.write_text(json.dumps(m))
        monkeypatch.setattr("tools.build_dart_gestures._MANIFEST", tmp_manifest)
        results = build(tmp_path / "empty", only={name})  # no npz staged
        assert results[0]["status"] == "missing-npz"
