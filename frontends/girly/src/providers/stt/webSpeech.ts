/**
 * WebSpeechSTTProvider – browser-native speech recognition.
 *
 * Uses the Web Speech API (window.SpeechRecognition / webkitSpeechRecognition).
 *
 * Browser support:
 *   Chrome / Edge: full support.
 *   Firefox / Safari: not supported (isSupported() returns false).
 *
 * Why continuous = false:
 *   Single-utterance mode.  The user taps the mic, speaks one sentence,
 *   and recognition stops automatically.  This maps cleanly to the
 *   "tap → speak → send" UX pattern without needing a separate
 *   "done speaking" signal.
 */

import { type STTProvider, type STTResultCallback, type STTErrorCallback } from '../types.ts';
import { type STTOptions } from '../../types/index.ts';

export class WebSpeechSTTProvider implements STTProvider {
  readonly name = 'webSpeech';
  readonly label = 'Web Speech API';

  /** The active SpeechRecognition instance, or null when idle. */
  private recognition: SpeechRecognition | null = null;

  /**
   * Returns true if the browser exposes the SpeechRecognition constructor.
   */
  isSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  /**
   * Begin listening.  Fires onResult with the recognised text, or
   * onError if something goes wrong.
   *
   * @param options  - Language hint (defaults to "en-US").
   * @param onResult - Callback receiving the final transcript string.
   * @param onError  - Callback receiving any recognition error.
   */
  start(options: STTOptions, onResult: STTResultCallback, onError: STTErrorCallback): void {
    if (!this.isSupported()) {
      onError(new Error('Speech recognition is not supported in this browser.'));
      return;
    }

    // Resolve the constructor – Chrome prefixes it.
    const SpeechRecognitionClass =
      (window as unknown as Record<string, typeof SpeechRecognition>).SpeechRecognition ??
      (window as unknown as Record<string, typeof SpeechRecognition>).webkitSpeechRecognition;

    const rec = new SpeechRecognitionClass();
    rec.continuous     = false;
    rec.interimResults = false;
    rec.lang           = options.lang ?? 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      // event.results is a SpeechRecognitionResultList.
      // Each item has a [0] alternative; we take the top result.
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ');
      onResult(transcript);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      onError(new Error(`STT error: ${event.error} – ${event.message ?? ''}`));
    };

    rec.onend = () => {
      // Recognition session ended (normal after single-utterance).
      this.recognition = null;
    };

    rec.start();
    this.recognition = rec;
  }

  /**
   * Stop the current recognition session, if one is active.
   */
  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }
}
