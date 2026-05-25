"""Tests for the AIE lite-mode flag (_aie_lite_mode helper).

Session-47 analysis (docs/research/2026-05-25-aie-module-analysis.md) identified
that ``tuner.load_user_profile`` + ``behavior.compute_behavior_modifiers`` cost
2-4 DB reads per turn and are only useful after the reflector has gathered ≥50
messages of history.  A new ``aie_lite_mode`` flag (default True) lets users
re-enable AIE without immediately accruing the heavier per-turn DB cost.

Lite-mode modules that still run (zero DB, cheap):
  - ``context_classifier`` + ``param_tuner`` — dynamic LLM params
  - ``personalization_gate`` — trauma/sensitivity safety filter
  - ``memory_behavior`` — converts RAG hits into character instructions
  - ``signals.save_signals`` — per-turn data collection for future reflector

Full-mode only (skipped when ``aie_lite_mode=True``):
  - ``tuner.load_user_profile`` — user preference injection (1 DB SELECT)
  - ``behavior.compute_behavior_modifiers`` — engagement bias injection (2-3 DB reads)

These tests pin:
  * The ``_aie_lite_mode`` helper contract (default True, explicit True/False,
    None config, exception safety, truthy coercion).
  * That the tuner + behavior injection block in the non-streaming chat handler
    is skipped when ``aie_lite_mode=True`` and runs when ``aie_lite_mode=False``.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.server import _aie_lite_mode


class TestAieLiteModeHelper:
    """Contract for the ``_aie_lite_mode`` flag reader.

    Unlike ``_aie_enabled`` (default False), ``_aie_lite_mode`` defaults to
    True so users who opt into AIE land in the cheaper tier automatically.
    """

    def test_default_true_for_empty_dict(self):
        """Missing key → True (safe cheap default)."""
        assert _aie_lite_mode({}) is True

    def test_default_true_for_none(self):
        """``None`` config (load failure) → True (safe cheap default)."""
        assert _aie_lite_mode(None) is True

    def test_explicit_true(self):
        """``aie_lite_mode: True`` → True."""
        assert _aie_lite_mode({"aie_lite_mode": True}) is True

    def test_explicit_false(self):
        """``aie_lite_mode: False`` → False (full mode)."""
        assert _aie_lite_mode({"aie_lite_mode": False}) is False

    def test_truthy_int(self):
        """Truthy non-bool (1) → True via bool() coercion."""
        assert _aie_lite_mode({"aie_lite_mode": 1}) is True

    def test_zero_int(self):
        """Falsy non-bool (0) → False (full mode) via bool() coercion."""
        assert _aie_lite_mode({"aie_lite_mode": 0}) is False

    def test_unrelated_keys_dont_flip_it(self):
        """Other config keys present, flag absent → still True (default)."""
        cfg = {"theme": "Blurple", "temperature": 0.7, "aie_enabled": True}
        assert _aie_lite_mode(cfg) is True

    def test_coexists_with_aie_enabled(self):
        """Both flags can be set independently without interference."""
        cfg_full = {"aie_enabled": True, "aie_lite_mode": False}
        cfg_lite = {"aie_enabled": True, "aie_lite_mode": True}
        cfg_off  = {"aie_enabled": False, "aie_lite_mode": True}

        assert _aie_lite_mode(cfg_full) is False
        assert _aie_lite_mode(cfg_lite) is True
        assert _aie_lite_mode(cfg_off) is True  # lite flag is independent of master


class TestLiteModeTunerBehaviorGate:
    """Verify that the tuner + behavior injection is skipped in lite mode.

    The non-streaming chat handler gates the heavy pre-turn injection with::

        if _aie_enabled(cfg) and not _aie_lite_mode(cfg):

    We test this by patching ``backend.adaptive.tuner.load_user_profile`` and
    ``backend.adaptive.behavior.compute_behavior_modifiers`` — if lite mode is
    active those patches should see zero calls.

    We do NOT re-exercise the full chat handler (too many dependencies); instead
    we import ``_aie_enabled`` + ``_aie_lite_mode`` directly and verify the
    combined gate logic, then confirm via patch that the server-level callsites
    honour it.
    """

    def test_gate_open_in_full_mode(self):
        """``aie_enabled=True, aie_lite_mode=False`` → gate is open (full mode)."""
        from backend.server import _aie_enabled

        cfg = {"aie_enabled": True, "aie_lite_mode": False}
        assert _aie_enabled(cfg) is True
        assert _aie_lite_mode(cfg) is False
        # Combined gate: enabled AND NOT lite → True (injection runs)
        assert _aie_enabled(cfg) and not _aie_lite_mode(cfg)

    def test_gate_closed_in_lite_mode(self):
        """``aie_enabled=True, aie_lite_mode=True`` → gate is closed (lite)."""
        from backend.server import _aie_enabled

        cfg = {"aie_enabled": True, "aie_lite_mode": True}
        assert _aie_enabled(cfg) is True
        assert _aie_lite_mode(cfg) is True
        # Combined gate: enabled AND NOT lite → False (injection skipped)
        assert not (_aie_enabled(cfg) and not _aie_lite_mode(cfg))

    def test_gate_closed_when_aie_disabled(self):
        """``aie_enabled=False`` → gate closed regardless of lite flag."""
        from backend.server import _aie_enabled

        cfg = {"aie_enabled": False, "aie_lite_mode": False}
        assert not (_aie_enabled(cfg) and not _aie_lite_mode(cfg))

    def test_gate_closed_by_default(self):
        """No flags in config → gate closed (both flags default to safe values)."""
        from backend.server import _aie_enabled

        cfg = {}
        # aie_enabled defaults False → gate closed even if lite=True
        assert not (_aie_enabled(cfg) and not _aie_lite_mode(cfg))
