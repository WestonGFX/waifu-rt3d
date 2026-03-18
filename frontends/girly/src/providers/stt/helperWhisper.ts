/**
 * HelperWhisperSTTProvider – Whisper-based speech recognition via the helper subprocess.
 *
 * Records audio using the MediaRecorder API, encodes as base64, and sends
 * to the helper's `/v1/stt/transcribe/base64` endpoint which runs
 * faster-whisper locally.
 *
 * Supports any Whisper model size (tiny through large-v3) — the helper
 * automatically selects the best installed model.
 *
 * @example
 *   const provider = new HelperWhisperSTTProvider();
 *   provider.start({ lang: 'en' }, (text) => console.log(text), console.error);
 */

import { type STTProvider, type STTResultCallback, type STTErrorCallback } from '../types.ts';
import { type STTOptions } from '../../types/index.ts';
import { transcribeAudioBase64 } from '../../services/helperClient.ts';

export class HelperWhisperSTTProvider implements STTProvider {
  readonly name = 'whisper';
  readonly label = 'Whisper (local)';

  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  /**
   * Returns true if MediaRecorder is available (needed to capture audio).
   * The actual Whisper availability is checked server-side.
   */
  isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function';
  }

  /**
   * Begin recording audio from the microphone. Stops after silence detection
   * or when stop() is called, then sends the recording to Whisper for transcription.
   *
   * @param options  - Language hint passed to Whisper (e.g. 'en', 'ja').
   * @param onResult - Callback receiving the transcribed text.
   * @param onError  - Callback receiving any recording or transcription error.
   */
  start(options: STTOptions, onResult: STTResultCallback, onError: STTErrorCallback): void {
    if (!this.isSupported()) {
      onError(new Error('MediaRecorder is not supported in this browser.'));
      return;
    }

    const chunks: Blob[] = [];

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        this.stream = stream;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        this.mediaRecorder = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          this.cleanup();

          if (chunks.length === 0) {
            onError(new Error('No audio data recorded.'));
            return;
          }

          const blob = new Blob(chunks, { type: mimeType });
          this.sendToWhisper(blob, options.lang, onResult, onError);
        };

        recorder.onerror = () => {
          this.cleanup();
          onError(new Error('MediaRecorder error during audio capture.'));
        };

        // Use timeslice to collect data every 250ms for reliability
        recorder.start(250);

        // Auto-stop after 30 seconds max to prevent runaway recordings
        setTimeout(() => {
          if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }, 30_000);
      })
      .catch((err) => {
        onError(new Error(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`));
      });
  }

  /**
   * Stop the current recording session. Triggers transcription of captured audio.
   */
  stop(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Convert audio blob to base64 and send to the helper for Whisper transcription.
   */
  private sendToWhisper(
    blob: Blob,
    lang: string | undefined,
    onResult: STTResultCallback,
    onError: STTErrorCallback,
  ): void {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        onError(new Error('Failed to encode audio as base64.'));
        return;
      }

      transcribeAudioBase64(base64, lang)
        .then((result) => {
          onResult(result.text);
        })
        .catch((err) => {
          onError(new Error(`Whisper transcription failed: ${err instanceof Error ? err.message : String(err)}`));
        });
    };
    reader.onerror = () => {
      onError(new Error('Failed to read audio blob.'));
    };
    reader.readAsDataURL(blob);
  }

  /**
   * Release media resources (microphone stream tracks).
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }
}
