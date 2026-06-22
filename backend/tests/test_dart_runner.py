"""Mac-side unit tests for backend/motion/dart_runner.py.

The runner's heavy work runs on the GPU box (DART must be importable from the DART
repo root). These tests lock the parts that must hold on ANY machine: the module
imports without DART present (all DART imports are lazy), construction stores config,
and ``generate`` refuses to run before ``load``. Live generation is verified
separately on the box (see the Stage-3 Phase-3 design doc / plan status log).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.motion.dart_runner import DEFAULT_CHECKPOINT, DartRunner  # noqa: E402


def test_module_imports_without_dart():
    """Importing dart_runner must NOT require DART (lazy imports) — the Mac server
    and tests import it freely; only .load()/.generate() touch DART."""
    import importlib
    import backend.motion.dart_runner as m
    importlib.reload(m)
    assert m.DEFAULT_CHECKPOINT.endswith("checkpoint_300000.pt")


def test_construction_stores_config():
    r = DartRunner("ckpt.pt", dataset="babel", device="cuda", guidance=4.0, batch_size=1)
    assert r.checkpoint == "ckpt.pt"
    assert r.dataset == "babel"
    assert r.guidance == 4.0
    assert r.loaded is False


def test_generate_before_load_raises():
    r = DartRunner()
    with pytest.raises(RuntimeError, match="load"):
        r.generate("wave")


def test_default_checkpoint_is_repo_relative():
    # Matches demos/run_demo.sh so a box deployment finds the checkpoint by default.
    assert DEFAULT_CHECKPOINT == "./mld_denoiser/mld_fps_clip_repeat_euler/checkpoint_300000.pt"
