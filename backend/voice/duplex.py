"""
VoiceDuplexSession — state machine for full-duplex voice conversation.

Manages the lifecycle of a single voice conversation WebSocket session:
    idle → listening → processing → speaking → idle

Each state transition emits a JSON control message to the client so it
can update its UI (VoiceOrb animation state, transcript display, etc.).

The session composes existing subsystems rather than reimplementing them:
    - ASR: backend.asr.registry.get_asr_adapter()
    - LLM + TTS: Internal HTTP call to /api/chat/stream (SSE)
    - Audio conversion: backend.voice.audio_utils

Architecture:
    Client sends:
        - Binary frames: WebM/Opus audio chunks from the microphone
        - JSON frames: {"type": "control", "action": "interrupt"|"config"|"ping"}

    Server sends:
        - Binary frames: TTS audio chunks (WAV or MP3)
        - JSON frames: {"type": "state"|"transcript"|"ai_text"|"error"|"pong"}
"""

import asyncio
import json
import logging
import time
from enum import Enum
from typing import TYPE_CHECKING, Optional

from starlette.websockets import WebSocket

if TYPE_CHECKING:
    import httpx

from backend.voice.audio_utils import (
    webm_to_pcm,
    webm_to_pcm_batch,
    pcm_to_wav,
    compute_rms_energy,
)

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────────

DEFAULT_SILENCE_TIMEOUT_MS = 1500
"""How long silence must persist before we consider speech ended."""

DEFAULT_VAD_THRESHOLD = 0.015
"""RMS energy threshold — below this is silence. Tuned for typical mic levels."""

SPEAKING_VAD_THRESHOLD = 0.06
"""Higher threshold during AI speech (echo gate). Browser echoCancellation
helps but isn't perfect; this prevents the AI's own audio from re-triggering."""

MAX_UTTERANCE_SECONDS = 30
"""Safety cap: don't buffer more than 30s of audio per utterance."""

MIN_UTTERANCE_BYTES = 3200
"""Minimum PCM bytes (~100ms at 16kHz mono) to bother sending to ASR."""


def _clamp(value: float, lo: float, hi: float) -> float:
    """Clamp a numeric value to [lo, hi]."""
    return max(lo, min(hi, value))


class SessionState(str, Enum):
    """States of the voice duplex session state machine."""
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"


class VoiceDuplexSession:
    """
    Manages one full-duplex voice conversation over a WebSocket.

    Usage:
        session = VoiceDuplexSession(websocket, session_id, char_id, cfg)
        await session.run()  # Blocks until the WebSocket closes

    The run() method enters the main receive loop. Audio chunks are
    accumulated and silence-detected. When speech ends, the accumulated
    audio is transcribed, the text is sent through the LLM, TTS audio
    is streamed back, and the cycle repeats.

    Args:
        ws: The accepted WebSocket connection.
        session_id: Chat session ID for message persistence.
        char_id: Character ID for LLM persona + TTS voice.
        cfg: Application config dict (from load_config()).

    Example:
        >>> session = VoiceDuplexSession(ws, session_id=1, char_id=1, cfg={})
        >>> await session.run()
    """

    def __init__(
        self,
        ws: WebSocket,
        session_id: int,
        char_id: int,
        cfg: dict,
    ):
        self.ws = ws
        self.session_id = session_id
        self.char_id = char_id
        self.cfg = cfg

        self.state = SessionState.IDLE
        self._audio_buffer = bytearray()
        self._webm_chunks: list[bytes] = []
        self._last_voice_time = 0.0
        self._speaking_task: Optional[asyncio.Task] = None
        self._interrupted = False
        self._http_client: Optional["httpx.AsyncClient"] = None
        self._base_url = cfg.get("voice.internal_url", cfg.get("internal_url", "http://127.0.0.1:8080"))

        # Configurable parameters (can be updated via control messages).
        # Config may use nested "voice" dict OR flat dot-notation keys.
        voice_cfg = cfg.get("voice", {}) if isinstance(cfg.get("voice"), dict) else {}
        self.silence_timeout_ms = _clamp(
            float(voice_cfg.get("silence_timeout_ms",
                  cfg.get("voice.silence_timeout_ms", DEFAULT_SILENCE_TIMEOUT_MS))),
            200, 10000,
        )
        self.vad_threshold = _clamp(
            float(voice_cfg.get("vad_threshold",
                  cfg.get("voice.vad_threshold", DEFAULT_VAD_THRESHOLD))),
            0.001, 0.5,
        )

    async def run(self) -> None:
        """
        Main event loop — receives WebSocket messages until disconnect.

        Dispatches binary frames to audio processing and text frames
        to control message handling.
        """
        import httpx

        await self._set_state(SessionState.IDLE)
        logger.info(f"[Voice] Session started (session={self.session_id}, char={self.char_id})")

        self._http_client = httpx.AsyncClient(timeout=httpx.Timeout(10, read=120))

        try:
            while True:
                message = await self.ws.receive()

                if message["type"] == "websocket.disconnect":
                    break

                if "bytes" in message and message["bytes"]:
                    await self._handle_audio(message["bytes"])
                elif "text" in message and message["text"]:
                    await self._handle_control(message["text"])

        except Exception as e:
            if "disconnect" not in str(e).lower():
                logger.error(f"[Voice] Session error: {e}")
                await self._send_json({"type": "error", "message": "Voice session error"})
        finally:
            self._cancel_speaking()
            if self._http_client:
                await self._http_client.aclose()
                self._http_client = None
            logger.info(f"[Voice] Session ended (session={self.session_id})")

    # ── Audio handling ───────────────────────────────────────────────────────────

    async def _handle_audio(self, webm_chunk: bytes) -> None:
        """
        Process an incoming audio chunk from the client.

        Buffers raw WebM chunks and converts a small sample to PCM for
        energy-based VAD. Full conversion happens in batch at utterance
        end (_process_utterance) to avoid per-chunk ffmpeg spawns.

        Args:
            webm_chunk: Raw WebM/Opus bytes from the browser's MediaRecorder.
        """
        try:
            pcm = await asyncio.get_running_loop().run_in_executor(
                None, webm_to_pcm, webm_chunk
            )
        except RuntimeError as e:
            logger.warning(f"[Voice] Audio conversion failed: {e}")
            return

        if not pcm:
            return

        energy = compute_rms_energy(pcm)
        now = time.monotonic()

        # Determine the active VAD threshold based on state
        threshold = (
            SPEAKING_VAD_THRESHOLD
            if self.state == SessionState.SPEAKING
            else self.vad_threshold
        )

        if energy > threshold:
            # Voice detected
            self._last_voice_time = now

            # Barge-in: user is speaking while AI is talking or processing
            if self.state in (SessionState.SPEAKING, SessionState.PROCESSING):
                await self._handle_interrupt()

            if self.state in (SessionState.IDLE, SessionState.SPEAKING, SessionState.PROCESSING):
                await self._set_state(SessionState.LISTENING)
                self._audio_buffer.clear()
                self._webm_chunks.clear()

            # Accumulate audio (with safety cap)
            max_bytes = MAX_UTTERANCE_SECONDS * 16000 * 2  # 16kHz, 16-bit
            if len(self._audio_buffer) < max_bytes:
                self._audio_buffer.extend(pcm)
                self._webm_chunks.append(webm_chunk)

        elif self.state == SessionState.LISTENING:
            # Still in listening state but below threshold — check silence duration
            max_bytes = MAX_UTTERANCE_SECONDS * 16000 * 2
            if len(self._audio_buffer) < max_bytes:
                self._audio_buffer.extend(pcm)
                self._webm_chunks.append(webm_chunk)

            silence_ms = (now - self._last_voice_time) * 1000
            if silence_ms >= self.silence_timeout_ms:
                # Silence timeout reached — process the utterance
                await self._process_utterance()

    async def _handle_control(self, text: str) -> None:
        """
        Handle a JSON control message from the client.

        Supported actions:
            - interrupt: Stop AI speech immediately (barge-in)
            - config: Update VAD/silence parameters
            - ping: Respond with pong (keepalive)

        Args:
            text: Raw JSON string from the WebSocket text frame.
        """
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            return

        action = msg.get("action", "")

        if action == "interrupt":
            await self._handle_interrupt()
        elif action == "config":
            if "silence_timeout_ms" in msg:
                self.silence_timeout_ms = _clamp(int(msg["silence_timeout_ms"]), 200, 10000)
            if "vad_threshold" in msg:
                self.vad_threshold = _clamp(float(msg["vad_threshold"]), 0.001, 0.5)
            await self._send_json({"type": "config_ack"})
        elif action == "ping":
            await self._send_json({"type": "pong", "ts": time.time()})

    # ── Utterance processing pipeline ────────────────────────────────────────────

    async def _process_utterance(self) -> None:
        """
        Process a complete user utterance: ASR → LLM → TTS → playback.

        Called when the silence timeout fires after speech was detected.
        The audio buffer is consumed and cleared.
        """
        audio_bytes = bytes(self._audio_buffer)
        self._audio_buffer.clear()

        if len(audio_bytes) < MIN_UTTERANCE_BYTES:
            await self._set_state(SessionState.IDLE)
            return

        await self._set_state(SessionState.PROCESSING)

        # ── Step 1: ASR ──────────────────────────────────────────────────────────
        transcript = await self._transcribe(audio_bytes)
        if not transcript or not transcript.strip():
            await self._set_state(SessionState.IDLE)
            return

        await self._send_json({
            "type": "transcript",
            "text": transcript,
            "role": "user",
        })

        # ── Step 2: LLM + TTS via /api/chat/stream ──────────────────────────────
        self._interrupted = False
        self._speaking_task = asyncio.create_task(
            self._stream_response(transcript)
        )

        try:
            await self._speaking_task
        except asyncio.CancelledError:
            logger.info("[Voice] Response cancelled (barge-in)")
        finally:
            self._speaking_task = None

        if not self._interrupted:
            await self._set_state(SessionState.IDLE)

    async def _transcribe(self, pcm_bytes: bytes) -> Optional[str]:
        """
        Run ASR on accumulated PCM audio.

        Uses the existing ASR adapter system (backend.asr.registry).

        Args:
            pcm_bytes: Raw 16kHz mono PCM audio.

        Returns:
            Transcribed text, or None if ASR fails or returns empty.
        """
        try:
            from backend.asr.registry import get_asr_adapter

            adapter = get_asr_adapter(self.cfg)
            if adapter is None:
                logger.warning("[Voice] No ASR adapter configured")
                await self._send_json({
                    "type": "error",
                    "message": "No ASR provider configured. Set up ASR in Settings.",
                })
                return None

            # ASR adapters expect WAV bytes
            wav_bytes = pcm_to_wav(pcm_bytes)
            result = await asyncio.get_running_loop().run_in_executor(
                None, adapter.transcribe, wav_bytes
            )

            text = result.get("text", "").strip() if isinstance(result, dict) else str(result).strip()
            logger.info(f"[Voice] ASR: \"{text[:80]}\"")
            return text if text else None

        except Exception as e:
            logger.error(f"[Voice] ASR failed: {e}")
            await self._send_json({
                "type": "error",
                "message": "Speech recognition failed",
            })
            return None

    async def _stream_response(self, user_text: str) -> None:
        """
        Send user text through the chat pipeline and stream TTS audio back.

        Makes an internal HTTP request to /api/chat/stream (SSE) and forwards
        token events and audio chunks over the WebSocket. This reuses the
        entire chat pipeline (system prompt, memory, emotions, TTS) without
        duplicating any logic.

        Args:
            user_text: Transcribed user speech to send as a chat message.
        """
        await self._set_state(SessionState.SPEAKING)

        client = self._http_client
        if not client:
            await self._send_json({"type": "error", "message": "HTTP client not initialized"})
            return

        try:
            async with client.stream(
                "POST",
                f"{self._base_url}/api/chat/stream",
                json={
                    "text": user_text,
                    "session_id": self.session_id,
                    "character_id": self.char_id,
                    "speak": True,
                },
                headers={"Accept": "text/event-stream"},
            ) as resp:
                if resp.status_code != 200:
                    await self._send_json({
                        "type": "error",
                        "message": f"Chat stream failed: HTTP {resp.status_code}",
                    })
                    return

                buffer = ""
                async for chunk in resp.aiter_text():
                    if self._interrupted:
                        return

                    buffer += chunk
                    while "\n\n" in buffer:
                        event_block, buffer = buffer.split("\n\n", 1)
                        await self._process_sse_event(event_block)

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"[Voice] Stream response error: {e}")
            await self._send_json({
                "type": "error",
                "message": "Response generation failed",
            })

    async def _process_sse_event(self, event_block: str) -> None:
        """
        Parse and forward a single SSE event from the chat stream.

        Extracts token deltas (for live transcript), audio chunks
        (forwarded as binary), and metadata (emotion, done).

        Args:
            event_block: Raw SSE event text (e.g. "event: token\\ndata: {...}").
        """
        event_type = "message"
        event_data = ""

        for line in event_block.strip().split("\n"):
            if line.startswith("event: "):
                event_type = line[7:].strip()
            elif line.startswith("data: "):
                event_data = line[6:]

        if not event_data:
            return

        try:
            data = json.loads(event_data)
        except json.JSONDecodeError:
            return

        if event_type == "token":
            # Forward token for live transcript display
            await self._send_json({
                "type": "ai_token",
                "text": data.get("t", ""),
            })

        elif event_type == "audio_chunk":
            # Fetch the TTS audio file and send as binary
            audio_url = data.get("url")
            if audio_url:
                await self._send_audio_from_url(audio_url)

        elif event_type == "done":
            # Forward the final reply text
            reply = data.get("reply", "")
            emotion = data.get("emotion")
            await self._send_json({
                "type": "ai_text",
                "text": reply,
                "emotion": emotion,
            })
            # If there's a single (non-chunked) audio URL, send it
            audio_url = data.get("audio_url")
            if audio_url:
                await self._send_audio_from_url(audio_url)

        elif event_type == "emotion":
            await self._send_json({
                "type": "emotion",
                "emotion": data.get("emotion"),
                "intensity": data.get("intensity", 1.0),
            })

        elif event_type == "error":
            await self._send_json({
                "type": "error",
                "message": data.get("error", "Unknown error"),
            })

    async def _send_audio_from_url(self, audio_path: str) -> None:
        """
        Fetch a TTS audio file from the local server and send it as a binary frame.

        Args:
            audio_path: Server-relative URL (e.g. "/files/audio/abc.mp3").
        """
        client = self._http_client
        if not client:
            return

        try:
            resp = await client.get(f"{self._base_url}{audio_path}")
            if resp.status_code == 200:
                await self.ws.send_bytes(resp.content)
        except Exception as e:
            logger.warning(f"[Voice] Failed to fetch audio {audio_path}: {e}")

    # ── Interrupt / barge-in ─────────────────────────────────────────────────────

    async def _handle_interrupt(self) -> None:
        """
        Handle barge-in: cancel any in-flight response and return to listening.

        Sets the interrupted flag (checked by _stream_response) and cancels
        the speaking task if running.
        """
        self._interrupted = True
        self._cancel_speaking()
        await self._send_json({"type": "interrupted"})
        logger.info("[Voice] Barge-in — AI speech interrupted")

    def _cancel_speaking(self) -> None:
        """Cancel the speaking task if it's running."""
        if self._speaking_task and not self._speaking_task.done():
            self._speaking_task.cancel()

    # ── State management ─────────────────────────────────────────────────────────

    async def _set_state(self, new_state: SessionState) -> None:
        """
        Transition to a new state and notify the client.

        Args:
            new_state: The target state.
        """
        old = self.state
        self.state = new_state
        if old != new_state:
            logger.debug(f"[Voice] State: {old.value} → {new_state.value}")
            await self._send_json({
                "type": "state",
                "state": new_state.value,
            })

    async def _send_json(self, data: dict) -> None:
        """
        Send a JSON control message to the client.

        Silently handles expected disconnection errors. Logs warnings
        for unexpected exceptions to avoid masking real bugs.

        Args:
            data: Dict to serialize as JSON.
        """
        try:
            await self.ws.send_json(data)
        except (RuntimeError, ConnectionError, OSError):
            # Expected when client has disconnected
            pass
        except Exception as e:
            logger.warning(f"[Voice] Unexpected send error: {type(e).__name__}: {e}")
