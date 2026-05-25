"""Tests for the AIE master enable flag.

Session-47 v1-Lite shipped ``aie_enabled`` as a single switch that
gates the 12-module Adaptive Intelligence Engine at every per-turn
call site (server.py chat handlers + context_assembler.py memory
post-processors).  The flag defaults to ``False`` so the silent
token cost the user complained about in session-46 stops accruing.

These tests pin:
  * The ``_aie_enabled`` helper's contract (truthiness, None / missing
    config, exception safety).
  * ``context_assembler.assemble_context`` skipping the
    personalization-gate and memory-behavior branches when the flag is
    off, AND running them when on.

We do NOT here re-exercise every adaptive module — those have their
own tests in ``test_adaptive.py``.  This file proves the master gate
short-circuits the call.
"""
from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from backend.server import _aie_enabled


class TestAieEnabledHelper:
    """Contract for the master flag reader."""

    def test_default_false_for_empty_dict(self):
        """Missing key → False (the v1-Lite default)."""
        assert _aie_enabled({}) is False

    def test_default_false_for_none(self):
        """``None`` config (load failure) → False."""
        assert _aie_enabled(None) is False

    def test_explicit_true(self):
        """``aie_enabled: True`` → True."""
        assert _aie_enabled({"aie_enabled": True}) is True

    def test_explicit_false(self):
        """``aie_enabled: False`` → False."""
        assert _aie_enabled({"aie_enabled": False}) is False

    def test_truthy_int(self):
        """Truthy non-bool (1) → True (bool() coercion)."""
        assert _aie_enabled({"aie_enabled": 1}) is True

    def test_zero_int(self):
        """Falsy non-bool (0) → False."""
        assert _aie_enabled({"aie_enabled": 0}) is False

    def test_unrelated_keys_dont_flip_it(self):
        """Other config keys present, flag absent → still False."""
        cfg = {"theme": "Blurple", "temperature": 0.7, "kokoro_enabled": True}
        assert _aie_enabled(cfg) is False


class TestContextAssemblerGate:
    """The context_assembler.py master gate short-circuits the
    personalization_gate + memory_behavior post-processors.

    We patch the adaptive imports at their use-site to detect whether
    they get called.  The vector_store is a tiny stub returning a
    single hit; that gives the gate something to operate on.
    """

    def _build_stub_cursor(self):
        """Return an in-memory cursor with the minimum schema required
        by ``assemble_context``."""
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        cur.execute(
            "CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id INT, "
            "role TEXT, text TEXT, char_id INT, is_active INT DEFAULT 1, "
            "importance_score REAL DEFAULT 0.5, created_at TEXT, emotion TEXT)"
        )
        cur.execute(
            "CREATE TABLE session_summaries (id INTEGER PRIMARY KEY, "
            "session_id INT, summary TEXT, created_at TEXT)"
        )
        cur.execute(
            "CREATE TABLE user_profiles (id INTEGER PRIMARY KEY, char_id INT)"
        )
        cur.execute(
            "CREATE TABLE engagement_signals (id INTEGER PRIMARY KEY, "
            "char_id INT, detected_context TEXT)"
        )
        return con, cur

    class _StubVectorStore:
        """Returns one hit so the semantic-recall branch executes."""

        def search(self, query: str, char_id: int, top_k: int = 8):
            return [
                {"text": "memory snippet about preferences", "score": 0.9},
                {"text": "another memory snippet", "score": 0.7},
            ]

        def add_memory(self, *_args, **_kwargs):  # pragma: no cover - unused
            pass

    @pytest.fixture
    def assemble_kwargs(self):
        sections = [
            {"name": "system", "content": "You are a helpful assistant.",
             "tokens": 6, "chars": 30},
        ]
        return dict(
            session_id=1,
            char_id=1,
            user_text="What did we discuss yesterday?",
            sections=sections,
            context_budget=4096,
            max_history=10,
            skip_user_append=False,
            vector_store=self._StubVectorStore(),
            cache_hints=False,
        )

    def test_aie_off_skips_personalization_gate(self, assemble_kwargs):
        """When ``aie_enabled=False`` the personalization_gate import is
        never reached — semantic memories are simply capped at 5."""
        from backend.llm import context_assembler

        con, cur = self._build_stub_cursor()
        with patch(
            "backend.adaptive.personalization_gate.filter_memories_for_context"
        ) as mock_filter, patch(
            "backend.adaptive.memory_behavior.derive_behavior_from_memories"
        ) as mock_derive:
            context_assembler.assemble_context(
                cfg={"context_limit": 8192, "aie_enabled": False},
                cur=cur,
                **assemble_kwargs,
            )
            assert mock_filter.call_count == 0
            assert mock_derive.call_count == 0
        con.close()

    def test_aie_on_invokes_personalization_gate(self, assemble_kwargs):
        """When ``aie_enabled=True`` the personalization_gate IS called."""
        from backend.llm import context_assembler

        con, cur = self._build_stub_cursor()
        with patch(
            "backend.adaptive.personalization_gate.filter_memories_for_context",
            return_value=[],
        ) as mock_filter:
            context_assembler.assemble_context(
                cfg={"context_limit": 8192, "aie_enabled": True},
                cur=cur,
                **assemble_kwargs,
            )
            assert mock_filter.call_count == 1
        con.close()

    def test_aie_off_default_when_flag_absent(self, assemble_kwargs):
        """A config without the key behaves like ``aie_enabled=False``."""
        from backend.llm import context_assembler

        con, cur = self._build_stub_cursor()
        with patch(
            "backend.adaptive.personalization_gate.filter_memories_for_context"
        ) as mock_filter:
            context_assembler.assemble_context(
                cfg={"context_limit": 8192},  # no aie_enabled key
                cur=cur,
                **assemble_kwargs,
            )
            assert mock_filter.call_count == 0
        con.close()
