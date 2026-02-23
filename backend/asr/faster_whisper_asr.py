"""
Faster-Whisper local ASR (Automatic Speech Recognition) backend.

Faster-Whisper is a re-implementation of OpenAI Whisper using CTranslate2,
providing 4× faster inference and lower memory usage — with comparable accuracy.
It runs completely offline on CPU or CUDA GPU, with no cloud dependency.

Supported model sizes (accuracy vs. speed tradeoff):
    tiny.en   ~39M  params — fastest, English-only
    base.en   ~74M  params — fast, English-only
    small     ~244M params — good balance
    medium    ~769M params — high accuracy
    large-v3  ~1.5B params — best accuracy, multilingual

Setup:
    pip install faster-whisper

Usage in app.json:
    "asr": {
        "provider": "faster_whisper",
        "model": "base.en",
        "gpu": false,
        "language": "en"
    }
"""

import logging
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level model singleton — loaded once on first call, reused thereafter.
# This avoids the ~2–5 second model load overhead on every transcription request.
_model = None
_model_size: Optional[str] = None


def get_model(cfg: dict):
    """Return a cached WhisperModel, loading it on first call.

    The model is kept in memory between calls.  If the configured model size
    differs from the currently loaded one, the existing model is replaced.

    Args:
        cfg: Application config dict.  Reads ``cfg["asr"]["model"]`` (default
             ``"base.en"``) and ``cfg["asr"]["gpu"]`` (default ``False``).

    Returns:
        A ``faster_whisper.WhisperModel`` instance.

    Raises:
        ImportError: If ``faster-whisper`` is not installed.
        RuntimeError: If the model fails to load.

    Example:
        >>> model = get_model({"asr": {"model": "base.en", "gpu": False}})
        >>> segments, _ = model.transcribe("audio.wav")
    """
    global _model, _model_size
    from faster_whisper import WhisperModel  # type: ignore[import]

    asr_cfg = cfg.get("asr", {})
    size = asr_cfg.get("model", "base.en")
    use_gpu = bool(asr_cfg.get("gpu", False))
    device = "cuda" if use_gpu else "cpu"
    compute_type = "float16" if use_gpu else "int8"

    if _model is None or _model_size != size:
        logger.info(f"Loading Faster-Whisper model '{size}' on {device} (compute={compute_type})...")
        _model = WhisperModel(size, device=device, compute_type=compute_type)
        _model_size = size
        logger.info(f"✅ Faster-Whisper model '{size}' loaded")

    return _model


def transcribe(audio_bytes: bytes, cfg: dict) -> str:
    """Transcribe raw audio bytes to text using Faster-Whisper.

    Writes audio to a temporary file (Faster-Whisper requires a file path),
    runs VAD-filtered transcription, and returns the concatenated segment text.

    Args:
        audio_bytes: Raw audio data — WebM from MediaRecorder or WAV.  Any
                     format that ffmpeg/soundfile can decode is accepted.
        cfg: Application config dict (same ``cfg["asr"]`` section as
             ``get_model``).  Additional key: ``language`` (default ``"en"``).

    Returns:
        Transcribed text string, stripped of leading/trailing whitespace.
        Returns an empty string on failure rather than raising.

    Example:
        >>> with open("speech.webm", "rb") as f:
        ...     text = transcribe(f.read(), {"asr": {"model": "base.en"}})
        >>> print(text)  # "Hello, how are you today?"
    """
    asr_cfg = cfg.get("asr", {})
    language = asr_cfg.get("language", "en") or None  # None → auto-detect

    suffix = ".webm"  # Default; WAV also works transparently
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model = get_model(cfg)
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            vad_filter=True,          # Suppress non-speech segments
            vad_parameters={
                "min_silence_duration_ms": 500,
                "speech_pad_ms": 200,
            },
            beam_size=5,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        logger.debug(f"[ASR] Transcribed {len(audio_bytes)} bytes → '{text[:80]}...'")
        return text
    except Exception as e:
        logger.error(f"Faster-Whisper transcription failed: {e}")
        return ""
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass
