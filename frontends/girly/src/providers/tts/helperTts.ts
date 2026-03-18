/**
 * HelperTTSProvider — generic TTS provider backed by the helper subprocess.
 *
 * This provider handles all helper-routed TTS engines: edge-tts, elevenlabs,
 * kokoro, and piper.  Each engine is a separate HelperTTSProvider instance
 * differentiated by `providerId`.
 *
 * Architecture:
 *   The provider POSTs text + provider_id + voice_id to /v1/tts/synthesize on
 *   the helper subprocess (127.0.0.1:8765).  The helper returns base64-encoded
 *   audio bytes (MP3 or WAV) which are decoded through the Web Audio API and
 *   played via an AudioBufferSourceNode.
 *
 * Cancellation:
 *   Tracks the currently playing AudioBufferSourceNode and disconnects it on
 *   cancel().  The promise in speak() rejects cleanly on cancellation.
 *
 * @example
 *   const edgeTts = new HelperTTSProvider('edge-tts', 'Edge TTS');
 *   await edgeTts.speak('Hello, senpai!', { rate: 0.95 });
 */

import { type TTSProvider } from '../types.ts';
import { type TTSOptions } from '../../types/index.ts';
import {
  synthesizeSpeech,
  type TTSAudioResponse,
} from '../../services/helperClient.ts';

/**
 * Decode a base64-encoded audio string into an ArrayBuffer.
 *
 * @param base64 - Base64-encoded audio data from the helper.
 * @returns Decoded bytes as an ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generic TTS provider that routes synthesis through the local helper subprocess.
 *
 * Supports any provider the helper knows about (edge-tts, elevenlabs, kokoro,
 * piper).  Construct one instance per engine; they share the same Web Audio
 * playback infrastructure.
 *
 * @example
 *   const provider = new HelperTTSProvider('edge-tts', 'Edge TTS', 'en-US-JennyNeural');
 *   await provider.speak('Konnichiwa!', { rate: 1.0 });
 */
export class HelperTTSProvider implements TTSProvider {
  readonly name: string;
  readonly label: string;

  /** The helper-side provider ID (e.g. 'edge-tts', 'elevenlabs'). */
  private readonly providerId: string;

  /**
   * Default voice ID used when no voice is specified in the speak() call.
   * Can be changed at runtime when the user selects a different voice.
   */
  voiceId: string;

  /**
   * Per-provider settings forwarded to the helper (e.g. stability, speed).
   * These are merged from the voice profile's providerSettings.
   */
  providerSettings: Record<string, string | number | boolean>;

  /** Reusable AudioContext — one per provider instance. */
  private audioCtx: AudioContext | null = null;

  /** The currently playing source node, kept so cancel() can stop it. */
  private currentSource: AudioBufferSourceNode | null = null;

  /** Resolve/reject handles for the active speak() promise. */
  private currentResolve: (() => void) | null = null;
  private currentReject: ((reason: Error) => void) | null = null;

  /**
   * @param providerId       - Helper-side provider key (e.g. 'edge-tts').
   * @param label            - Human-readable display name.
   * @param defaultVoiceId   - Default voice to use if none specified.
   * @param providerSettings - Default per-provider settings.
   */
  constructor(
    providerId: string,
    label: string,
    defaultVoiceId = '',
    providerSettings: Record<string, string | number | boolean> = {},
  ) {
    this.name = providerId;
    this.providerId = providerId;
    this.label = label;
    this.voiceId = defaultVoiceId;
    this.providerSettings = providerSettings;
  }

  /**
   * Returns true because the Web Audio API is universally supported.
   * Actual engine availability is determined by the helper's /v1/tts/providers.
   */
  isSupported(): boolean {
    return typeof AudioContext !== 'undefined'
      || typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
  }

  /**
   * Speak the given text using the configured provider and voice.
   *
   * Cancels any in-progress utterance before starting.
   *
   * @param text    - The text to synthesise.
   * @param options - Optional rate override (pitch/lang ignored — engine controls those).
   * @returns Resolves when playback ends; rejects on error or cancel().
   */
  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!text.trim()) return;

    // Tear down any in-flight playback so new speech starts immediately.
    this.cancel();

    const response: TTSAudioResponse = await synthesizeSpeech({
      text: text.trim(),
      provider: {
        providerId: this.providerId,
        voiceId: this.voiceId || undefined,
      },
      providerSettings: {
        ...this.providerSettings,
        ...(options?.rate !== undefined ? { rate: options.rate } : {}),
      },
    });

    const arrayBuffer = base64ToArrayBuffer(response.audioBase64);

    // Lazy-initialise the AudioContext on first use.
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctor();
    }

    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

    return new Promise<void>((resolve, reject) => {
      if (!this.audioCtx) {
        reject(new Error(`${this.label}: AudioContext was closed before playback could start.`));
        return;
      }

      this.currentResolve = resolve;
      this.currentReject = reject;

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      source.onended = () => {
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
   * Immediately stop any currently playing utterance and reject the
   * outstanding speak() promise with a cancellation error.
   */
  cancel(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // stop() throws if node was never started or already stopped.
      }
      this.currentSource = null;
    }

    if (this.currentReject) {
      this.currentReject(new Error(`${this.label}: playback cancelled.`));
      this.currentReject = null;
      this.currentResolve = null;
    }
  }
}
