from pathlib import Path
import hashlib, time


class TTSAdapter:
    """Abstract base class for all TTS provider adapters.

    Provides shared helpers for deterministic filename generation and a
    content-addressed caching layer that wraps any concrete ``speak()``
    implementation.  Cached files are stored as ``cache_<sha1>.{ext}``
    so identical (text, voice, settings) requests skip re-synthesis on
    subsequent calls.

    Subclasses must implement ``speak(text, tts_cfg) -> dict`` and should
    call ``self._mk_name(key, ext)`` when they need a *new* (timestamped)
    output filename.  The server should call ``speak_cached(...)`` instead
    of ``speak(...)`` directly to benefit from the cache.
    """

    def __init__(self, audio_dir: Path):
        """
        Args:
            audio_dir: Directory where synthesised audio files are stored.
        """
        self.audio_dir = audio_dir

    # ------------------------------------------------------------------ #
    # Filename helpers
    # ------------------------------------------------------------------ #

    def _mk_name(self, key: str, ext: str) -> str:
        """Generate a timestamped (non-deterministic) output filename.

        Use this when you want a fresh file each time (e.g. during active
        synthesis before the result is cached).

        Args:
            key: A string that uniquely identifies the synthesis parameters.
            ext: File extension without the leading dot (e.g. "mp3").

        Returns:
            Filename string like ``"1708615234_a3f9c12b.mp3"``.
        """
        h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
        return f"{int(time.time())}_{h}.{ext}"

    def _cache_name(self, text: str, tts_cfg: dict, ext: str) -> str:
        """Generate a deterministic, content-addressed cache filename.

        The hash is derived from the text plus the subset of TTS settings
        that actually affect audio output (voice, rate, pitch).  This means
        two calls with the same text/voice/rate/pitch return the same name
        even if other irrelevant config keys differ.

        Args:
            text: The text to be synthesised.
            tts_cfg: TTS config dict (``voice_id``, ``speech_rate``, etc.).
            ext: File extension without the leading dot.

        Returns:
            Filename string like ``"cache_a3f9c12bd8e71f20.mp3"``.
        """
        key = "|".join([
            text,
            str(tts_cfg.get("voice_id", "")),
            str(tts_cfg.get("speech_rate", "")),
            str(tts_cfg.get("tts_rate", "")),
            str(tts_cfg.get("tts_pitch", "")),
            str(tts_cfg.get("pitch_shift", "")),
        ])
        h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:24]
        return f"cache_{h}.{ext}"

    # ------------------------------------------------------------------ #
    # Core interface
    # ------------------------------------------------------------------ #

    def speak(self, text: str, tts_cfg: dict) -> dict:
        """Synthesise ``text`` using this adapter's TTS provider.

        Args:
            text: Plain text to synthesise (pre-cleaned by ``_clean_for_tts``).
            tts_cfg: Dict of provider-specific settings (voice_id, rate, etc.).

        Returns:
            ``{"ok": True, "filename": str, "meta": dict}`` on success,
            or ``{"ok": False, "error": str}`` on failure.
        """
        raise NotImplementedError

    def speak_cached(self, text: str, tts_cfg: dict) -> dict:
        """Like ``speak()`` but with content-addressed file caching.

        On a cache hit (file already exists on disk), synthesis is skipped
        entirely and the cached filename is returned with ``"cached": True``.
        On a cache miss, ``speak()`` is called; the resulting file is renamed
        to the deterministic cache path so future calls are instant.

        The cache supports both ``.mp3`` and ``.wav`` outputs from different
        providers.

        Args:
            text: Plain text to synthesise.
            tts_cfg: TTS config dict.

        Returns:
            Same shape as ``speak()``, plus ``"cached": True`` on hit.

        Example:
            >>> result = adapter.speak_cached("Hello!", {"voice_id": "en-US-Aria"})
            >>> result["ok"]
            True
            >>> result.get("cached")  # True on second call
            True
        """
        if not text or not text.strip():
            return {"ok": False, "error": "empty text"}

        # Check both common extensions for a cache hit
        for ext in ("mp3", "wav"):
            candidate = self.audio_dir / self._cache_name(text, tts_cfg, ext)
            if candidate.exists() and candidate.stat().st_size > 0:
                return {"ok": True, "filename": candidate.name, "cached": True, "meta": {"provider": "cache"}}

        # Cache miss — synthesise normally
        result = self.speak(text, tts_cfg)

        if result.get("ok") and result.get("filename"):
            gen_path = self.audio_dir / result["filename"]
            if gen_path.exists():
                ext = result["filename"].rsplit(".", 1)[-1] if "." in result["filename"] else "mp3"
                cache_path = self.audio_dir / self._cache_name(text, tts_cfg, ext)
                try:
                    # Rename to deterministic path; future calls find it immediately
                    gen_path.rename(cache_path)
                    result["filename"] = cache_path.name
                    result["cached"] = False
                except OSError:
                    # If rename fails (e.g. cross-device), leave original filename
                    pass

        return result
