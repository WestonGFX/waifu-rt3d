/**
 * HelperCloneTTSProvider — voice-cloning TTS backed by the local helper subprocess.
 *
 * Architecture:
 *   The provider POSTs text + a voice_id (opaque sample reference) to
 *   /api/tts/clone/speak on the helper process running at 127.0.0.1:8765.
 *   The helper returns raw audio/wav bytes which are played through the Web
 *   Audio API.  A single AudioContext is reused across calls to avoid the
 *   browser's hard limit on simultaneous contexts.
 *
 * Availability:
 *   isSupported() always returns true at construction time — the Web Audio API
 *   is present in every modern browser.  Actual engine availability is
 *   determined at call-time by the helper's /api/tts/clone/engines endpoint.
 *   When the helper is offline the speak() call throws a descriptive error
 *   that the TTS orchestration layer can catch and fall back from.
 *
 * Cancellation:
 *   We track the currently playing AudioBufferSourceNode and disconnect it on
 *   cancel().  The promise in speak() rejects cleanly on cancellation so
 *   callers can distinguish a user-initiated stop from an error.
 */

import { type TTSProvider } from '../types.ts';
import { type TTSOptions } from '../../types/index.ts';
import { DEFAULT_HELPER_BASE_URL } from '../../services/helperClient.ts';

/** Payload sent to POST /api/tts/clone/speak. */
interface CloneSpeakRequestBody {
  text: string;
  voice_id: string;
  rate: number;
}

/**
 * TTS provider that synthesises speech via the helper subprocess's voice-clone
 * engine.  Supports Fish Speech, F5-TTS, and CosyVoice when installed.
 *
 * @example
 *   const provider = new HelperCloneTTSProvider('sample-abc123');
 *   await provider.speak('Hello, world!', { rate: 0.95 });
 */
export class HelperCloneTTSProvider implements TTSProvider {
  readonly name = 'helperClone';
  readonly label = 'Voice Clone (Helper)';

  /** Base URL of the helper subprocess, injected for testability. */
  private readonly baseUrl: string;

  /**
   * Opaque voice sample ID returned by voiceCloneService.uploadVoiceSample().
   * Can be changed at runtime (e.g. when the user switches to a different
   * cloned voice) without constructing a new provider instance.
   */
  voiceId: string;

  /** Reusable AudioContext — one per provider instance. */
  private audioCtx: AudioContext | null = null;

  /** The currently playing source node, kept so cancel() can stop it. */
  private currentSource: AudioBufferSourceNode | null = null;

  /**
   * Resolve/reject handles for the promise returned by the active speak() call.
   * Needed so cancel() can reject that promise rather than letting it dangle.
   */
  private currentResolve: (() => void) | null = null;
  private currentReject: ((reason: Error) => void) | null = null;

  /**
   * @param voiceId - Voice sample ID to use for synthesis.  Can be updated
   *   via the voiceId property after construction.
   * @param baseUrl - Override the helper base URL (defaults to 127.0.0.1:8765).
   */
  constructor(voiceId = '', baseUrl = DEFAULT_HELPER_BASE_URL) {
    this.voiceId = voiceId;
    this.baseUrl = baseUrl;
  }

  /**
   * Returns true because the Web Audio API is universally supported in modern
   * browsers.  Whether the helper engine is *installed* is checked at call-time.
   */
  isSupported(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
  }

  /**
   * Speak the given text using the configured cloned voice.
   *
   * Cancels any in-progress utterance before starting, exactly mirroring the
   * WebSpeechTTSProvider behaviour so callers get immediate audio.
   *
   * @param text    - The text to synthesise (whitespace-only strings are skipped).
   * @param options - Optional rate override.  Pitch and lang are ignored because
   *   voice-clone engines control those through the voice model itself.
   * @returns Resolves when playback ends, rejects on network/helper error or
   *   if cancel() is called before playback finishes.
   *
   * @example
   *   await provider.speak('Konnichiwa!', { rate: 0.9 });
   */
  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!text.trim()) {
      return;
    }

    // Tear down any in-flight playback first so new speech starts immediately.
    this.cancel();

    const body: CloneSpeakRequestBody = {
      text: text.trim(),
      voice_id: this.voiceId,
      rate: options?.rate ?? 1.0,
    };

    const response = await fetch(`${this.baseUrl}/api/tts/clone/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `HelperCloneTTS: helper returned ${response.status} — ${detail || 'no detail'}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    // Lazy-initialise the AudioContext on first use (browsers require a user
    // gesture before audio can play; by the time speak() is called that gesture
    // has already happened via the chat input).
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctor();
    }

    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

    return new Promise<void>((resolve, reject) => {
      // Guard against a race where cancel() fired between decodeAudioData and here.
      if (!this.audioCtx) {
        reject(new Error('HelperCloneTTS: AudioContext was closed before playback could start.'));
        return;
      }

      this.currentResolve = resolve;
      this.currentReject = reject;

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      source.onended = () => {
        // Only resolve if this is still the tracked source (not replaced by a
        // subsequent speak() call that raced with onended).
        if (this.currentSource === source) {
          this.currentSource = null;
          this.currentResolve = null;
          this.currentReject = null;
          resolve();
        }
      };

      this.currentSource = source;
      source.start(0);
    });
  }

  /**
   * Immediately stop any currently playing utterance and reject the outstanding
   * speak() promise with a cancellation error.
   */
  cancel(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // stop() throws if the node was never started or already stopped.
        // Safe to ignore — we just want it silent.
      }
      this.currentSource = null;
    }

    if (this.currentReject) {
      this.currentReject(new Error('HelperCloneTTS: playback cancelled.'));
      this.currentReject = null;
      this.currentResolve = null;
    }
  }
}
