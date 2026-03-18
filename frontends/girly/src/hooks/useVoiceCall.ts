/**
 * useVoiceCall — orchestration hook for the STT → LLM → TTS voice call loop.
 *
 * Connects the pure state machine from {@link voiceCallService} to the
 * actual I/O providers (STT, LLM via ChatContext, TTS) and exposes a
 * React-friendly API for the {@link VoiceCallOverlay} component.
 *
 * The hook handles:
 *   - Starting/stopping WebSpeech STT in response to state machine transitions
 *   - Sending transcribed text through ChatContext's `sendMessage`
 *   - Playing the assistant's response through TTS
 *   - Cooldown timers between turns
 *   - Mute toggle and barge-in (via user action, not VAD in v1)
 *   - AbortController for clean teardown on endCall()
 *
 * @example
 *   const voiceCall = useVoiceCall();
 *   <VoiceCallOverlay
 *     isActive={voiceCall.isActive}
 *     phase={voiceCall.phase}
 *     ...
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createVoiceCallController,
  type VoiceCallController,
  type VoiceCallState,
} from '../services/voiceCallService.ts';
import { getSTTProvider, getTTSProvider } from '../providers/registry.ts';
import { useChat } from '../context/ChatContext.tsx';
import { useApp } from '../context/AppContext.tsx';
import { VOICE_PRESETS } from '../services/voicePresets.ts';
import { useSettings } from '../context/SettingsContext.tsx';

/** Public API returned by the hook. */
export interface UseVoiceCallReturn {
  /** Whether a voice call session is active. */
  isActive: boolean;
  /** Current phase of the voice pipeline. */
  phase: VoiceCallState['phase'];
  /** Last recognised transcript from STT. */
  lastTranscript: string;
  /** Whether the microphone is muted. */
  isMuted: boolean;
  /** Begin a new voice call session. */
  startCall: () => void;
  /** End the current voice call session. */
  endCall: () => void;
  /** Toggle mute on/off. */
  toggleMute: () => void;
  /** Manually trigger STT start (for push-to-talk). */
  startListening: () => void;
  /** Manually trigger STT stop (sends captured audio). */
  stopListening: () => void;
  /** Current error message, if any. */
  error: string | null;
}

/**
 * Resolve the active TTS provider name from the provider config.
 *
 * @param providerConfig - The app's provider config.
 * @returns The primary TTS provider name (e.g. 'webSpeech', 'helperClone').
 */
function getActiveTtsProviderName(
  providerConfig: { tts: { primary: string } },
): string {
  return providerConfig.tts.primary || 'webSpeech';
}

/**
 * Orchestrates the voice-to-voice conversation loop.
 *
 * Binds the voice call state machine to the STT/TTS providers and
 * ChatContext's sendMessage function, creating a complete hands-free
 * conversation experience.
 *
 * Uses refs for sendMessage, ttsProviderName, and voicePreset to avoid
 * stale closures in the phase-transition useEffect — these values change
 * on every render but the effect should only re-run on phase transitions.
 *
 * @returns Controls and state for driving the VoiceCallOverlay UI.
 */
export default function useVoiceCall(): UseVoiceCallReturn {
  const { sendMessage } = useChat();
  const { state: appState } = useApp();
  const { state: settingsState } = useSettings();

  const [callState, setCallState] = useState<VoiceCallState>({
    phase: 'idle',
    isActive: false,
    lastTranscript: '',
    lastResponse: '',
    turnCount: 0,
    error: null,
  });
  const [isMuted, setIsMuted] = useState(false);

  const controllerRef = useRef<VoiceCallController | null>(null);
  const isMutedRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Refs to avoid stale closures in the phase-transition effect.
  // The effect only depends on callState.phase, but needs current values
  // of these when it runs.
  const sendMessageRef = useRef(sendMessage);
  const ttsProviderNameRef = useRef('webSpeech');
  const voicePresetRef = useRef(VOICE_PRESETS[0]);

  // Resolve TTS options from the selected voice preset
  const voicePreset = VOICE_PRESETS.find(
    (p) => p.name === settingsState.selectedVoiceName,
  ) ?? VOICE_PRESETS[0];
  const ttsProviderName = getActiveTtsProviderName(appState.providerConfig);

  // Keep refs in sync with latest values
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { ttsProviderNameRef.current = ttsProviderName; }, [ttsProviderName]);
  useEffect(() => { voicePresetRef.current = voicePreset; }, [voicePreset]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Initialise the controller once
  useEffect(() => {
    const controller = createVoiceCallController();
    controllerRef.current = controller;

    const unsub = controller.onStateChange((newState) => {
      setCallState(newState);
    });

    return () => {
      unsub();
      controller.stop();
      controllerRef.current = null;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  // React to phase transitions to drive I/O
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (callState.phase === 'listening' && !isMutedRef.current) {
      const stt = getSTTProvider('webSpeech');
      if (stt.isSupported()) {
        stt.start(
          { lang: voicePresetRef.current?.options?.lang ?? 'en-US' },
          (transcript) => {
            controller.notifyTranscriptReady(transcript);
          },
          (err) => {
            controller.setError(err.message || 'Speech recognition failed');
          },
        );
      }
    }

    if (callState.phase === 'processing' && callState.lastTranscript) {
      // Create an AbortController so endCall() can cancel mid-flight
      const abort = new AbortController();
      abortRef.current = abort;

      void (async () => {
        try {
          const responseText = await sendMessageRef.current(callState.lastTranscript);
          if (abort.signal.aborted) return;
          controller.notifyResponseReady(responseText || '');
        } catch (err) {
          if (abort.signal.aborted) return;
          controller.setError(
            err instanceof Error ? err.message : 'LLM request failed',
          );
          controller.stop();
        }
      })();
    }

    if (callState.phase === 'speaking' && callState.lastResponse) {
      void (async () => {
        try {
          const tts = getTTSProvider(ttsProviderNameRef.current);
          if (tts.isSupported()) {
            await tts.speak(callState.lastResponse, voicePresetRef.current?.options ?? {});
          }
          controller.notifyTTSEnd();
        } catch {
          controller.notifyTTSEnd();
        }
      })();
    }

    if (callState.phase === 'cooldown') {
      cooldownTimerRef.current = setTimeout(() => {
        controller.notifyCooldownEnd();
        cooldownTimerRef.current = null;
      }, 500);
    }
  }, [callState.phase, callState.lastTranscript, callState.lastResponse]);

  const startCall = useCallback(() => {
    controllerRef.current?.start();
    setIsMuted(false);
  }, []);

  const endCall = useCallback(() => {
    // Abort any in-flight LLM request
    abortRef.current?.abort();
    abortRef.current = null;

    try { getSTTProvider('webSpeech').stop(); } catch { /* ignore */ }
    try { getTTSProvider(ttsProviderNameRef.current).cancel(); } catch { /* ignore */ }

    controllerRef.current?.stop();
    setIsMuted(false);

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        try { getSTTProvider('webSpeech').stop(); } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  const startListening = useCallback(() => {
    if (callState.phase === 'idle') {
      controllerRef.current?.start();
    }
  }, [callState.phase]);

  const stopListening = useCallback(() => {
    try { getSTTProvider('webSpeech').stop(); } catch { /* ignore */ }
  }, []);

  return {
    isActive: callState.isActive,
    phase: callState.phase,
    lastTranscript: callState.lastTranscript,
    isMuted,
    startCall,
    endCall,
    toggleMute,
    startListening,
    stopListening,
    error: callState.error,
  };
}
