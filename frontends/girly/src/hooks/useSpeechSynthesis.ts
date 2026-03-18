import { useState, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useCompanion } from '../context/CompanionContext.tsx';
import { executeTTS } from '../providers/registry.ts';
import { base64ToArrayBuffer } from '../services/audioPlaybackService.ts';
import { synthesizeSpeech } from '../services/helperClient.ts';
import {
  type TTSProviderRef,
  type TTSVoiceProfile,
} from '../types/companion.ts';
import {
  chunkSpeechText,
  convertGainDbToLinear,
  normalizeSpeechText,
  resolveSpeechChain,
} from '../services/ttsOrchestrationService.ts';

export default function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { state: appState } = useApp();
  const { state: companionState, activeVoiceProfile } = useCompanion();
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const supportsProfile = useCallback((profile: TTSVoiceProfile | null | undefined) => {
    if (!profile) return false;
    if (profile.primary.providerId === 'webSpeech') return true;
    return companionState.helperHealth.ok || profile.fallbacks.some((provider) => provider.providerId === 'webSpeech');
  }, [companionState.helperHealth.ok]);

  const isSupported = useMemo(() => supportsProfile(activeVoiceProfile), [activeVoiceProfile, supportsProfile]);

  const playAudioBuffer = useCallback(async (
    audioBase64: string,
    options: {
      playbackRate: number;
      playbackGainDb: number;
    },
  ) => {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('Web Audio is not supported in this browser.');
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Ignore repeated stop requests.
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    const decoded = await audioContext.decodeAudioData(base64ToArrayBuffer(audioBase64).slice(0));

    await new Promise<void>((resolve) => {
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      source.buffer = decoded;
      source.playbackRate.value = options.playbackRate;
      gainNode.gain.value = convertGainDbToLinear(options.playbackGainDb);
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
        gainNode.disconnect();
        resolve();
      };
      sourceRef.current = source;
      source.start(0);
    });
  }, []);

  const speakWithHelper = useCallback(async (
    text: string,
    chain: TTSProviderRef[],
    profile: TTSVoiceProfile,
  ) => {
    let lastError: Error | null = null;

    for (const provider of chain) {
      if (provider.providerId === 'webSpeech') {
        const providerSettings = profile.providerSettings.webSpeech ?? {};
        await executeTTS(
          text,
          {
            lang: 'en-US',
            pitch: typeof providerSettings.pitch === 'number' ? providerSettings.pitch : 1,
            rate: typeof providerSettings.rate === 'number' ? providerSettings.rate : profile.playbackRate,
          },
          appState.providerConfig.tts,
        );
        return;
      }

      try {
        const providerSettings = profile.providerSettings[provider.providerId] ?? {};
        const response = await synthesizeSpeech({
          text,
          profileId: profile.id,
          provider,
          providerSettings,
        }, companionState.helperBaseUrl);
        await playAudioBuffer(response.audioBase64, {
          playbackRate: profile.playbackRate,
          playbackGainDb: profile.playbackGainDb,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) throw lastError;
  }, [
    appState.providerConfig.tts,
    companionState.helperBaseUrl,
    playAudioBuffer,
  ]);

  /**
   * Speak the given text using the active voice preset.
   * Cancels any in-progress utterance first (handled by the provider).
   *
   * @param text - The text to synthesise.
   */
  const speak = useCallback(async (
    text: string,
    profileOverride?: TTSVoiceProfile | null,
  ) => {
    const profile = profileOverride ?? activeVoiceProfile;
    if (!profile || !supportsProfile(profile) || !text.trim()) return;
    setIsSpeaking(true);
    try {
      const chain = resolveSpeechChain(profile);
      const chunks = chunkSpeechText(normalizeSpeechText(text), profile.chunkingMode);
      for (const chunk of chunks) {
        await speakWithHelper(chunk, chain, profile);
      }
    } catch {
      // TTS is best-effort; executeTTS already logs warnings.
    } finally {
      setIsSpeaking(false);
    }
  }, [activeVoiceProfile, speakWithHelper, supportsProfile]);

  return { speak, isSpeaking, isSupported, supportsProfile };
}
