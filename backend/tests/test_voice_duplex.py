"""Tests for VoiceDuplexSession state machine.

Validates state transitions, config clamping, barge-in interrupts,
control message handling, and _send_json error resilience using a
mock WebSocket — no real network or audio required.
"""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.voice.duplex import (
    DEFAULT_SILENCE_TIMEOUT_MS,
    DEFAULT_VAD_THRESHOLD,
    SessionState,
    VoiceDuplexSession,
    _clamp,
)



# ── Mock WebSocket ──────────────────────────────────────────────────────────────


class MockWebSocket:
    """Minimal WebSocket mock that records sent messages.

    Captures all JSON and binary frames for assertion. Supports
    optional error injection for testing _send_json resilience.

    Attributes:
        sent: List of all messages sent (dicts for JSON, bytes for binary).
        closed: Whether close() was called.
        send_error: Optional exception to raise on send_json().
    """

    def __init__(self) -> None:
        self.sent: list[Any] = []
        self.closed: bool = False
        self.send_error: Exception | None = None

    async def send_json(self, data: dict) -> None:
        """Record a JSON message, or raise send_error if set.

        Args:
            data: The JSON-serializable dict to send.

        Raises:
            Exception: Whatever is set in self.send_error.
        """
        if self.send_error is not None:
            raise self.send_error
        self.sent.append(data)

    async def send_bytes(self, data: bytes) -> None:
        """Record a binary message.

        Args:
            data: Raw bytes to send.
        """
        self.sent.append(data)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        """Mark the WebSocket as closed.

        Args:
            code: WebSocket close code.
            reason: Close reason string.
        """
        self.closed = True


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _make_session(
    ws: MockWebSocket | None = None,
    cfg: dict | None = None,
) -> VoiceDuplexSession:
    """Create a VoiceDuplexSession with sensible defaults.

    Args:
        ws: WebSocket mock (creates one if None).
        cfg: Config dict (empty dict if None).

    Returns:
        A configured VoiceDuplexSession ready for testing.
    """
    if ws is None:
        ws = MockWebSocket()
    if cfg is None:
        cfg = {}
    return VoiceDuplexSession(ws=ws, session_id=1, char_id=1, cfg=cfg)


def _json_messages(ws: MockWebSocket) -> list[dict]:
    """Filter sent messages to only JSON dicts.

    Args:
        ws: The mock WebSocket to inspect.

    Returns:
        List of dict messages (excludes binary frames).
    """
    return [m for m in ws.sent if isinstance(m, dict)]


# ── State transitions ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestStateTransitions:
    """Tests for the session state machine transitions."""

    async def test_initial_state_is_idle(self) -> None:
        """A new session should start in IDLE state."""
        session = _make_session()
        assert session.state == SessionState.IDLE

    async def test_set_state_updates_state(self) -> None:
        """_set_state should update the state attribute."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        await session._set_state(SessionState.LISTENING)
        assert session.state == SessionState.LISTENING

    async def test_set_state_sends_notification(self) -> None:
        """_set_state should send a state-change JSON message to the client."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        await session._set_state(SessionState.LISTENING)
        msgs = _json_messages(ws)
        assert len(msgs) == 1
        assert msgs[0] == {"type": "state", "state": "listening"}

    async def test_set_state_no_duplicate_notification(self) -> None:
        """Setting the same state twice should not send a second notification."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        await session._set_state(SessionState.LISTENING)
        await session._set_state(SessionState.LISTENING)
        msgs = _json_messages(ws)
        assert len(msgs) == 1

    async def test_full_state_cycle(self) -> None:
        """Verify a complete IDLE -> LISTENING -> PROCESSING -> SPEAKING -> IDLE cycle."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)

        transitions = [
            SessionState.LISTENING,
            SessionState.PROCESSING,
            SessionState.SPEAKING,
            SessionState.IDLE,
        ]
        for state in transitions:
            await session._set_state(state)

        msgs = _json_messages(ws)
        states = [m["state"] for m in msgs if m["type"] == "state"]
        assert states == ["listening", "processing", "speaking", "idle"]

    async def test_state_values_are_strings(self) -> None:
        """SessionState enum values should be lowercase strings."""
        assert SessionState.IDLE.value == "idle"
        assert SessionState.LISTENING.value == "listening"
        assert SessionState.PROCESSING.value == "processing"
        assert SessionState.SPEAKING.value == "speaking"


# ── Config validation / clamping ────────────────────────────────────────────────


class TestConfigValidation:
    """Tests for __init__ config parameter clamping."""

    def test_default_values(self) -> None:
        """Without config, defaults should be used."""
        session = _make_session(cfg={})
        assert session.silence_timeout_ms == DEFAULT_SILENCE_TIMEOUT_MS
        assert session.vad_threshold == DEFAULT_VAD_THRESHOLD

    def test_silence_timeout_clamped_low(self) -> None:
        """silence_timeout_ms below 200 should be clamped to 200."""
        cfg = {"voice": {"silence_timeout_ms": 50}}
        session = _make_session(cfg=cfg)
        assert session.silence_timeout_ms == 200

    def test_silence_timeout_clamped_high(self) -> None:
        """silence_timeout_ms above 10000 should be clamped to 10000."""
        cfg = {"voice": {"silence_timeout_ms": 99999}}
        session = _make_session(cfg=cfg)
        assert session.silence_timeout_ms == 10000

    def test_silence_timeout_within_range(self) -> None:
        """silence_timeout_ms within [200, 10000] should pass through."""
        cfg = {"voice": {"silence_timeout_ms": 3000}}
        session = _make_session(cfg=cfg)
        assert session.silence_timeout_ms == 3000

    def test_vad_threshold_clamped_low(self) -> None:
        """vad_threshold below 0.001 should be clamped to 0.001."""
        cfg = {"voice": {"vad_threshold": -1.0}}
        session = _make_session(cfg=cfg)
        assert session.vad_threshold == 0.001

    def test_vad_threshold_clamped_high(self) -> None:
        """vad_threshold above 0.5 should be clamped to 0.5."""
        cfg = {"voice": {"vad_threshold": 1.0}}
        session = _make_session(cfg=cfg)
        assert session.vad_threshold == 0.5

    def test_vad_threshold_within_range(self) -> None:
        """vad_threshold within [0.001, 0.5] should pass through."""
        cfg = {"voice": {"vad_threshold": 0.05}}
        session = _make_session(cfg=cfg)
        assert session.vad_threshold == pytest.approx(0.05)

    def test_flat_config_keys(self) -> None:
        """Dot-notation config keys should work as fallback."""
        cfg = {"voice.silence_timeout_ms": 2500, "voice.vad_threshold": 0.03}
        session = _make_session(cfg=cfg)
        assert session.silence_timeout_ms == 2500
        assert session.vad_threshold == pytest.approx(0.03)


# ── Barge-in / interrupt ────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestBargeIn:
    """Tests for interrupt / barge-in handling."""

    async def test_handle_interrupt_sets_flag(self) -> None:
        """_handle_interrupt should set _interrupted to True."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        session.state = SessionState.PROCESSING
        assert session._interrupted is False

        await session._handle_interrupt()
        assert session._interrupted is True

    async def test_handle_interrupt_sends_message(self) -> None:
        """_handle_interrupt should send an 'interrupted' message to the client."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        session.state = SessionState.SPEAKING

        await session._handle_interrupt()
        msgs = _json_messages(ws)
        assert any(m.get("type") == "interrupted" for m in msgs)

    async def test_handle_interrupt_cancels_speaking_task(self) -> None:
        """_handle_interrupt should cancel the _speaking_task if present."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)

        # Create a long-running dummy task
        async def _dummy() -> None:
            await asyncio.sleep(999)

        session._speaking_task = asyncio.create_task(_dummy())
        await session._handle_interrupt()

        # Yield control so the cancellation propagates
        await asyncio.sleep(0)
        assert session._speaking_task.cancelled()

    async def test_cancel_speaking_no_task(self) -> None:
        """_cancel_speaking should not raise when no task is running."""
        session = _make_session()
        session._speaking_task = None
        session._cancel_speaking()  # Should not raise


# ── _handle_control config action ───────────────────────────────────────────────


@pytest.mark.asyncio
class TestHandleControlConfig:
    """Tests for the config control message handler."""

    async def test_config_updates_silence_timeout(self) -> None:
        """Config action should update silence_timeout_ms."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({"action": "config", "silence_timeout_ms": 5000})
        await session._handle_control(msg)
        assert session.silence_timeout_ms == 5000

    async def test_config_updates_vad_threshold(self) -> None:
        """Config action should update vad_threshold."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({"action": "config", "vad_threshold": 0.1})
        await session._handle_control(msg)
        assert session.vad_threshold == pytest.approx(0.1)

    async def test_config_clamps_values(self) -> None:
        """Config action should clamp out-of-range values."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({
            "action": "config",
            "silence_timeout_ms": 1,
            "vad_threshold": 99.0,
        })
        await session._handle_control(msg)
        assert session.silence_timeout_ms == 200
        assert session.vad_threshold == 0.5

    async def test_config_sends_ack(self) -> None:
        """Config action should respond with a config_ack message."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({"action": "config", "silence_timeout_ms": 3000})
        await session._handle_control(msg)
        msgs = _json_messages(ws)
        assert any(m.get("type") == "config_ack" for m in msgs)

    async def test_ping_sends_pong(self) -> None:
        """Ping action should respond with a pong containing a timestamp."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({"action": "ping"})
        await session._handle_control(msg)
        msgs = _json_messages(ws)
        pongs = [m for m in msgs if m.get("type") == "pong"]
        assert len(pongs) == 1
        assert "ts" in pongs[0]

    async def test_invalid_json_ignored(self) -> None:
        """Malformed JSON should be silently ignored."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        await session._handle_control("not valid json{{{")
        msgs = _json_messages(ws)
        assert len(msgs) == 0

    async def test_unknown_action_ignored(self) -> None:
        """An unrecognized action should be silently ignored."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        msg = json.dumps({"action": "unknown_thing"})
        await session._handle_control(msg)
        msgs = _json_messages(ws)
        assert len(msgs) == 0


# ── _send_json error handling ───────────────────────────────────────────────────


@pytest.mark.asyncio
class TestSendJsonErrorHandling:
    """Tests for _send_json exception resilience."""

    async def test_runtime_error_silenced(self) -> None:
        """RuntimeError (disconnected client) should be caught silently."""
        ws = MockWebSocket()
        ws.send_error = RuntimeError("WebSocket is closed")
        session = _make_session(ws=ws)
        # Should not raise
        await session._send_json({"type": "test"})

    async def test_connection_error_silenced(self) -> None:
        """ConnectionError should be caught silently."""
        ws = MockWebSocket()
        ws.send_error = ConnectionError("Connection reset")
        session = _make_session(ws=ws)
        await session._send_json({"type": "test"})

    async def test_os_error_silenced(self) -> None:
        """OSError should be caught silently."""
        ws = MockWebSocket()
        ws.send_error = OSError("Broken pipe")
        session = _make_session(ws=ws)
        await session._send_json({"type": "test"})

    async def test_unexpected_error_logged(self, caplog: pytest.LogCaptureFixture) -> None:
        """Unexpected exceptions should be logged as warnings but not raised."""
        ws = MockWebSocket()
        ws.send_error = ValueError("Something weird")
        session = _make_session(ws=ws)

        with caplog.at_level(logging.WARNING):
            await session._send_json({"type": "test"})

        assert any("Unexpected send error" in r.message for r in caplog.records)

    async def test_successful_send(self) -> None:
        """Normal sends should work without error."""
        ws = MockWebSocket()
        session = _make_session(ws=ws)
        await session._send_json({"type": "test", "data": 42})
        assert ws.sent == [{"type": "test", "data": 42}]
