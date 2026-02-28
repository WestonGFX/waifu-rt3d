"""
Audio format conversion utilities for the full-duplex voice pipeline.

Handles WebM/Opus → PCM conversion, WAV wrapping, and resampling
using ffmpeg as a subprocess (no Python audio library dependencies).

All functions are synchronous and should be called from a threadpool
when used in async contexts.
"""

import io
import struct
import subprocess
import tempfile
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────────

TARGET_SAMPLE_RATE = 16000
"""ASR models (Whisper, faster-whisper) expect 16kHz mono PCM."""

FFMPEG_BIN = "ffmpeg"
"""Path to ffmpeg binary. Assumes it's on PATH."""


def webm_to_pcm(webm_bytes: bytes, sample_rate: int = TARGET_SAMPLE_RATE) -> bytes:
    """
    Convert WebM/Opus audio to raw 16-bit PCM using ffmpeg.

    The browser's MediaRecorder typically outputs WebM with Opus codec.
    This converts to mono 16kHz 16-bit signed little-endian PCM, which
    is what Whisper-family ASR models expect.

    Args:
        webm_bytes: Raw WebM container bytes from the browser.
        sample_rate: Target sample rate (default 16000 for ASR).

    Returns:
        Raw PCM bytes (s16le, mono, at target sample rate).

    Raises:
        RuntimeError: If ffmpeg is not found or conversion fails.

    Example:
        >>> pcm = webm_to_pcm(webm_data)
        >>> len(pcm)  # ~32000 bytes per second of audio at 16kHz
    """
    return _run_ffmpeg_pcm(webm_bytes, sample_rate)


def webm_to_pcm_batch(chunks: list[bytes], sample_rate: int = TARGET_SAMPLE_RATE) -> bytes:
    """
    Convert multiple accumulated WebM/Opus chunks to PCM in a single ffmpeg call.

    Instead of spawning one ffmpeg process per 100ms chunk, this concatenates
    the raw WebM bytes and runs a single conversion. This reduces process
    overhead from ~10 spawns/sec/user to 1 spawn per utterance.

    Args:
        chunks: List of WebM container byte chunks from the browser.
        sample_rate: Target sample rate (default 16000 for ASR).

    Returns:
        Raw PCM bytes (s16le, mono, at target sample rate).

    Raises:
        RuntimeError: If ffmpeg is not found or conversion fails.

    Example:
        >>> pcm = webm_to_pcm_batch([chunk1, chunk2, chunk3])
        >>> len(pcm) > 0
        True
    """
    if not chunks:
        return b""
    combined = b"".join(chunks)
    return _run_ffmpeg_pcm(combined, sample_rate)


def _run_ffmpeg_pcm(input_bytes: bytes, sample_rate: int) -> bytes:
    """
    Internal helper: pipe bytes through ffmpeg → s16le PCM.

    Args:
        input_bytes: Audio container bytes (WebM/Opus, WAV, etc.).
        sample_rate: Target sample rate.

    Returns:
        Raw PCM bytes.

    Raises:
        RuntimeError: If ffmpeg is not found or conversion fails.
    """
    try:
        result = subprocess.run(
            [
                FFMPEG_BIN,
                "-i", "pipe:0",       # Read from stdin
                "-f", "s16le",        # Output raw PCM
                "-acodec", "pcm_s16le",
                "-ar", str(sample_rate),
                "-ac", "1",           # Mono
                "pipe:1",             # Write to stdout
            ],
            input=input_bytes,
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")[:200]
            raise RuntimeError(f"ffmpeg conversion failed (rc={result.returncode}): {stderr}")
        return result.stdout
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg not found on PATH. Install ffmpeg for audio conversion: "
            "brew install ffmpeg (macOS) or apt install ffmpeg (Linux)"
        )


def pcm_to_wav(pcm_bytes: bytes, sample_rate: int = TARGET_SAMPLE_RATE, channels: int = 1) -> bytes:
    """
    Wrap raw PCM data in a WAV header.

    Useful when the ASR adapter expects a .wav file rather than raw PCM.

    Args:
        pcm_bytes: Raw 16-bit signed little-endian PCM data.
        sample_rate: Sample rate of the PCM data.
        channels: Number of audio channels (1 = mono).

    Returns:
        Complete WAV file bytes with proper RIFF header.

    Example:
        >>> wav = pcm_to_wav(pcm_data)
        >>> wav[:4]
        b'RIFF'
    """
    bits_per_sample = 16
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = len(pcm_bytes)

    buf = io.BytesIO()
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    # fmt sub-chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))              # Sub-chunk size
    buf.write(struct.pack("<H", 1))               # PCM format
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    # data sub-chunk
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_bytes)

    return buf.getvalue()


def compute_rms_energy(pcm_bytes: bytes) -> float:
    """
    Compute RMS energy of 16-bit PCM audio.

    Used for simple energy-based voice activity detection.
    Returns a value between 0.0 (silence) and 1.0 (max amplitude).

    Args:
        pcm_bytes: Raw 16-bit signed little-endian PCM data.

    Returns:
        Normalized RMS energy (0.0 to 1.0).

    Example:
        >>> energy = compute_rms_energy(silence_pcm)
        >>> energy < 0.01
        True
    """
    if len(pcm_bytes) < 2:
        return 0.0

    n_samples = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{n_samples}h", pcm_bytes[:n_samples * 2])

    sum_sq = sum(s * s for s in samples)
    rms = (sum_sq / n_samples) ** 0.5

    # Normalize: max int16 is 32767
    return min(rms / 32767.0, 1.0)


def save_temp_wav(pcm_bytes: bytes, sample_rate: int = TARGET_SAMPLE_RATE) -> str:
    """
    Write PCM data to a temporary WAV file and return its path.

    The caller is responsible for deleting the file after use.
    This is useful for ASR adapters that expect a file path rather
    than raw bytes.

    Args:
        pcm_bytes: Raw 16-bit PCM data.
        sample_rate: Sample rate of the PCM data.

    Returns:
        Absolute path to the temporary WAV file.
    """
    wav_bytes = pcm_to_wav(pcm_bytes, sample_rate)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.write(wav_bytes)
    tmp.close()
    return tmp.name
