/**
 * WebSpeechTTSProvider – browser-native speech synthesis.
 *
 * Uses window.speechSynthesis + SpeechSynthesisUtterance.
 *
 * Why cancel() before speak():
 *   If the AI responds while a previous utterance is still playing the
 *   new one would queue behind it, causing noticeable lag.  Cancelling
 *   first gives immediate audio feedback.  This is the standard TTS UX
 *   pattern in browser apps.
 *
 * Voice selection:
 *   Phase 1 uses predefined pitch/rate presets that tune the browser's
 *   default voice rather than enumerating the system voice list.  System
 *   voices vary wildly across OS/browser, so presets give consistent UX.
 */

import { type TTSProvider } from '../types.ts';
import { type TTSOptions } from '../../types/index.ts';

export class WebSpeechTTSProvider implements TTSProvider {
  readonly name = 'webSpeech';
  readonly label = 'Web Speech API';

  /**
   * Returns true if the browser exposes window.speechSynthesis.
   */
  isSupported(): boolean {
    return 'speechSynthesis' in window;
  }

  /**
   * Speak the given text.  Cancels any in-progress utterance first.
   *
   * @param text    - The text to synthesise.
   * @param options - Pitch, rate, and language overrides.
   * @returns A promise that resolves when the utterance finishes (or rejects on error).
   *
   * @example
   *   const tts = new WebSpeechTTSProvider();
   *   await tts.speak('Hello!', { pitch: 1.2, rate: 0.9 });
   */
  speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.isSupported()) {
      return Promise.reject(new Error('Speech synthesis is not supported in this browser.'));
    }

    // Cancel any currently playing utterance so the new one starts immediately.
    window.speechSynthesis.cancel();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      if (options?.lang)  utterance.lang  = options.lang;
      if (options?.pitch != null) utterance.pitch = options.pitch;
      if (options?.rate  != null) utterance.rate  = options.rate;

      utterance.onend   = () => resolve();
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        reject(new Error(`TTS error: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Cancel any currently playing speech immediately.
   */
  cancel(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }
}
