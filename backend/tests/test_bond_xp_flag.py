"""Tests for the Bond XP master enable flag.

Session-47 v1-Lite shipped ``bond_xp_enabled`` as a master switch
that stops the per-turn Bond XP / milestone / unlock pipeline from
accruing when the BondPill UI is hidden.  The flag defaults to
False so re-enabling the BondPill later doesn't fire surprise
milestone modals from XP banked invisibly across past sessions.

These tests pin the ``_bond_xp_enabled`` helper contract and the
``_BondGateClosed`` sentinel exception used by the gate-via-raise
pattern inside the chat handlers' try blocks.
"""
from __future__ import annotations

from backend.server import _bond_xp_enabled, _BondGateClosed


class TestBondXpEnabledHelper:
    """Contract for the master flag reader."""

    def test_default_false_for_empty_dict(self):
        """Missing key → False (the v1-Lite default)."""
        assert _bond_xp_enabled({}) is False

    def test_default_false_for_none(self):
        """``None`` config (load failure) → False."""
        assert _bond_xp_enabled(None) is False

    def test_explicit_true(self):
        """``bond_xp_enabled: True`` → True."""
        assert _bond_xp_enabled({"bond_xp_enabled": True}) is True

    def test_explicit_false(self):
        """``bond_xp_enabled: False`` → False."""
        assert _bond_xp_enabled({"bond_xp_enabled": False}) is False

    def test_aie_flag_does_not_affect_bond(self):
        """The AIE master flag and Bond XP flag are independent —
        flipping one must not silently flip the other."""
        cfg = {"aie_enabled": True, "bond_xp_enabled": False}
        assert _bond_xp_enabled(cfg) is False

        cfg = {"aie_enabled": False, "bond_xp_enabled": True}
        assert _bond_xp_enabled(cfg) is True

    def test_truthy_int(self):
        assert _bond_xp_enabled({"bond_xp_enabled": 1}) is True

    def test_zero_int(self):
        assert _bond_xp_enabled({"bond_xp_enabled": 0}) is False


class TestBondGateClosedSentinel:
    """The sentinel exception class is referenced by name from the
    chat-handler try/except blocks.  Renaming it silently would
    break the gate, so this test pins the public surface."""

    def test_is_an_exception_subclass(self):
        assert issubclass(_BondGateClosed, Exception)

    def test_can_be_raised_and_caught(self):
        try:
            raise _BondGateClosed()
        except _BondGateClosed:
            caught = True
        assert caught is True

    def test_caught_by_bare_exception_too(self):
        """The bond handlers have a fallback ``except Exception`` —
        confirm the sentinel doesn't escape that net if the
        sentinel-specific branch is ever removed."""
        try:
            raise _BondGateClosed()
        except Exception:
            caught = True
        assert caught is True
