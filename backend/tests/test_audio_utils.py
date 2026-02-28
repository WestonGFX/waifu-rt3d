"""Tests for backend.voice.audio_utils.

Validates PCM/WAV conversion, RMS energy computation, and batch
conversion edge cases without requiring ffmpeg or real audio data.
"""

import struct
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.voice.audio_utils import compute_rms_energy, pcm_to_wav, webm_to_pcm_batch
from backend.voice.duplex import _clamp


# ── Helper factories ────────────────────────────────────────────────────────────


def _make_silence(n_samples: int = 160) -> bytes:
    """Generate silent PCM: all-zero 16-bit samples.

    Args:
        n_samples: Number of samples to generate.

    Returns:
        Raw PCM bytes (s16le) of silence.
    """
    return struct.pack(f"<{n_samples}h", *([0] * n_samples))


def _make_max_amplitude(n_samples: int = 160) -> bytes:
    """Generate max-amplitude PCM: all samples at +32767.

    Args:
        n_samples: Number of samples to generate.

    Returns:
        Raw PCM bytes (s16le) at maximum amplitude.
    """
    return struct.pack(f"<{n_samples}h", *([32767] * n_samples))


def _make_half_amplitude(n_samples: int = 160) -> bytes:
    """Generate half-amplitude PCM: all samples at +16384.

    Args:
        n_samples: Number of samples to generate.

    Returns:
        Raw PCM bytes (s16le) at ~50% amplitude.
    """
    return struct.pack(f"<{n_samples}h", *([16384] * n_samples))


# ── compute_rms_energy ──────────────────────────────────────────────────────────


class TestComputeRmsEnergy:
    """Tests for the RMS energy computation function."""

    def test_empty_bytes_returns_zero(self) -> None:
        """Empty input should return 0.0."""
        assert compute_rms_energy(b"") == 0.0

    def test_single_byte_returns_zero(self) -> None:
        """Input shorter than 2 bytes (one sample) should return 0.0."""
        assert compute_rms_energy(b"\x00") == 0.0

    def test_silence_returns_zero(self) -> None:
        """All-zero PCM (silence) should yield 0.0 energy."""
        silence = _make_silence(320)
        assert compute_rms_energy(silence) == 0.0

    def test_max_amplitude_returns_approx_one(self) -> None:
        """Max-amplitude PCM should yield energy very close to 1.0."""
        loud = _make_max_amplitude(320)
        energy = compute_rms_energy(loud)
        assert energy == pytest.approx(1.0, abs=0.001)

    def test_half_amplitude_normalized_correctly(self) -> None:
        """Half-amplitude PCM should yield ~0.5 energy."""
        half = _make_half_amplitude(320)
        energy = compute_rms_energy(half)
        assert 0.45 < energy < 0.55

    def test_result_between_zero_and_one(self) -> None:
        """Energy is always clamped to [0.0, 1.0] for any valid PCM."""
        pcm = struct.pack("<4h", -10000, 10000, -5000, 5000)
        energy = compute_rms_energy(pcm)
        assert 0.0 <= energy <= 1.0

    def test_odd_byte_count_truncates(self) -> None:
        """Odd-length input should ignore the trailing byte, not crash."""
        # 3 bytes = 1 sample (2 bytes) + 1 leftover byte
        pcm = struct.pack("<h", 16384) + b"\xff"
        energy = compute_rms_energy(pcm)
        assert energy > 0.0


# ── pcm_to_wav ──────────────────────────────────────────────────────────────────


class TestPcmToWav:
    """Tests for the PCM-to-WAV wrapper function."""

    def test_starts_with_riff_header(self) -> None:
        """WAV output must begin with the 'RIFF' magic bytes."""
        wav = pcm_to_wav(b"\x00\x00")
        assert wav[:4] == b"RIFF"

    def test_contains_wave_marker(self) -> None:
        """WAV output must contain the 'WAVE' format marker at offset 8."""
        wav = pcm_to_wav(b"\x00\x00")
        assert wav[8:12] == b"WAVE"

    def test_contains_fmt_chunk(self) -> None:
        """WAV output must contain the 'fmt ' sub-chunk."""
        wav = pcm_to_wav(b"\x00\x00")
        assert b"fmt " in wav

    def test_contains_data_chunk(self) -> None:
        """WAV output must contain the 'data' sub-chunk."""
        wav = pcm_to_wav(b"\x00\x00")
        assert b"data" in wav

    def test_riff_size_field_correct(self) -> None:
        """RIFF chunk size should be 36 + data_size."""
        pcm = _make_silence(100)  # 200 bytes
        wav = pcm_to_wav(pcm)
        riff_size = struct.unpack("<I", wav[4:8])[0]
        assert riff_size == 36 + len(pcm)

    def test_data_chunk_size_correct(self) -> None:
        """Data sub-chunk size should equal the input PCM length."""
        pcm = _make_silence(100)
        wav = pcm_to_wav(pcm)
        # data chunk starts at offset 36: "data" + 4-byte size + PCM
        data_size = struct.unpack("<I", wav[40:44])[0]
        assert data_size == len(pcm)

    def test_total_length_correct(self) -> None:
        """Total WAV length should be 44-byte header + PCM data."""
        pcm = _make_silence(50)
        wav = pcm_to_wav(pcm)
        assert len(wav) == 44 + len(pcm)

    def test_sample_rate_encoded(self) -> None:
        """The sample rate should be encoded in the fmt sub-chunk."""
        wav = pcm_to_wav(b"\x00\x00", sample_rate=44100)
        # Sample rate is at offset 24 in the WAV header
        sr = struct.unpack("<I", wav[24:28])[0]
        assert sr == 44100

    def test_empty_pcm_produces_valid_header(self) -> None:
        """Empty PCM should still produce a valid 44-byte WAV header."""
        wav = pcm_to_wav(b"")
        assert len(wav) == 44
        assert wav[:4] == b"RIFF"

    def test_pcm_data_preserved(self) -> None:
        """The raw PCM data should appear verbatim after the 44-byte header."""
        pcm = struct.pack("<4h", 100, -200, 300, -400)
        wav = pcm_to_wav(pcm)
        assert wav[44:] == pcm


# ── webm_to_pcm_batch ──────────────────────────────────────────────────────────


class TestWebmToPcmBatch:
    """Tests for the batch WebM-to-PCM conversion function."""

    def test_empty_list_returns_empty(self) -> None:
        """An empty chunk list should return empty bytes without calling ffmpeg."""
        result = webm_to_pcm_batch([])
        assert result == b""


# ── _clamp helper ───────────────────────────────────────────────────────────────


class TestClamp:
    """Tests for the _clamp utility from duplex.py."""

    def test_value_within_range(self) -> None:
        """A value already in [lo, hi] should pass through unchanged."""
        assert _clamp(5.0, 0.0, 10.0) == 5.0

    def test_value_below_range(self) -> None:
        """A value below lo should be clamped to lo."""
        assert _clamp(-1.0, 0.0, 10.0) == 0.0

    def test_value_above_range(self) -> None:
        """A value above hi should be clamped to hi."""
        assert _clamp(15.0, 0.0, 10.0) == 10.0

    def test_value_at_lo_boundary(self) -> None:
        """A value exactly at lo should pass through."""
        assert _clamp(0.0, 0.0, 10.0) == 0.0

    def test_value_at_hi_boundary(self) -> None:
        """A value exactly at hi should pass through."""
        assert _clamp(10.0, 0.0, 10.0) == 10.0

    def test_negative_range(self) -> None:
        """Clamping should work correctly with negative boundaries."""
        assert _clamp(-5.0, -10.0, -1.0) == -5.0
        assert _clamp(-15.0, -10.0, -1.0) == -10.0
        assert _clamp(0.0, -10.0, -1.0) == -1.0
