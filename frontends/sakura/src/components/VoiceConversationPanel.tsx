import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, PhoneOff, Hand } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { useFullDuplexVoice } from '../hooks/useFullDuplexVoice';
import type { VoiceSessionState, VoiceDuplexConfig } from '../hooks/useFullDuplexVoice';
import { useAppStore } from '../stores/appStore';

// ── Types ───────────────────────────────────────────────────────────────────────

interface VoiceConversationPanelProps {
  /** Chat session ID. */
  sessionId: number | null;
  /** Character ID. */
  charId: number | null;
  /** Called when the user wants to exit voice mode. */
  onClose: () => void;
  /** Called when a user transcription should be injected into the chat. */
  onUserMessage?: (text: string) => void;
  /** Called when an AI response should be injected into the chat. */
  onAIMessage?: (text: string, emotion?: string) => void;
}

/** A single transcript entry (user or AI). */
interface TranscriptEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// ── Component ───────────────────────────────────────────────────────────────────

/**
 * Full voice conversation UI panel.
 *
 * Replaces the text composer when voice mode is active. Shows:
 *   - A VoiceOrb indicating the current session state
 *   - A scrolling transcript of the conversation
 *   - AI token streaming as it's generated
 *   - Connect/disconnect and interrupt controls
 *
 * @param props - Session/character IDs, callbacks, and close handler.
 *
 * @example
 * <VoiceConversationPanel
 *   sessionId={1}
 *   charId={1}
 *   onClose={() => setVoiceMode(false)}
 *   onUserMessage={(text) => chatStore.addMessage(text, 'user')}
 *   onAIMessage={(text) => chatStore.addMessage(text, 'assistant')}
 * />
 */
export function VoiceConversationPanel({
  sessionId,
  charId,
  onClose,
  onUserMessage,
  onAIMessage,
}: VoiceConversationPanelProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [aiStreamText, setAiStreamText] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  // Read voice duplex config from app settings
  const appConfig = useAppStore((s) => s.config);
  const voiceConfig = useMemo<VoiceDuplexConfig>(() => ({
    silenceTimeoutMs: Number(appConfig['voice.silence_timeout_ms'] ?? 1500),
    vadThreshold: Number(appConfig['voice.vad_threshold'] ?? 0.015),
  }), [appConfig]);

  const {
    state,
    isActive,
    connect,
    disconnect,
    toggle,
    interrupt,
    inputLevel,
  } = useFullDuplexVoice({
    sessionId,
    charId,
    voiceConfig,
    onTranscript: (text) => {
      const entry: TranscriptEntry = {
        id: ++idCounter.current,
        role: 'user',
        text,
        timestamp: Date.now(),
      };
      setTranscript((prev) => [...prev, entry]);
      setAiStreamText('');
      onUserMessage?.(text);
    },
    onAIToken: (token) => {
      setAiStreamText((prev) => prev + token);
    },
    onAIResponse: (text, emotion) => {
      const entry: TranscriptEntry = {
        id: ++idCounter.current,
        role: 'assistant',
        text,
        timestamp: Date.now(),
      };
      setTranscript((prev) => [...prev, entry]);
      setAiStreamText('');
      onAIMessage?.(text, emotion);
    },
    onError: (message) => {
      console.warn('[VoicePanel]', message);
    },
  });

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, aiStreamText]);

  // Auto-connect on mount, disconnect on unmount (fire-once intentional)
  useEffect(() => {
    if (sessionId && charId) {
      connect();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--color-background)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* ── Transcript area ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
        }}
      >
        {transcript.length === 0 && !aiStreamText && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              color: 'var(--color-text-muted)',
              fontSize: '0.78rem',
              textAlign: 'center',
            }}
          >
            <VoiceOrb state={state} inputLevel={inputLevel} size={80} />
            <div style={{ marginTop: 24 }}>
              {state === 'idle'
                ? 'Listening for your voice...'
                : state === 'disconnected'
                  ? 'Tap the mic to start'
                  : ''}
            </div>
          </div>
        )}

        {transcript.map((entry) => (
          <div
            key={entry.id}
            style={{
              alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 12,
              fontSize: '0.82rem',
              lineHeight: 1.5,
              backgroundColor:
                entry.role === 'user'
                  ? 'var(--color-accent-soft)'
                  : 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            {entry.text}
          </div>
        ))}

        {/* Streaming AI text */}
        {aiStreamText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 12,
              fontSize: '0.82rem',
              lineHeight: 1.5,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
              opacity: 0.8,
            }}
          >
            {aiStreamText}
            <span className="animate-pulse" style={{ color: 'var(--color-accent)' }}>
              |
            </span>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* ── Bottom controls ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {/* State indicator (small orb when transcript has entries) */}
        {transcript.length > 0 && (
          <VoiceOrb state={state} inputLevel={inputLevel} size={36} />
        )}

        {/* Interrupt button — visible during speaking/processing */}
        <AnimatePresence>
          {(state === 'speaking' || state === 'processing') && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={interrupt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                border: '1px solid rgba(245,158,11,0.4)',
                backgroundColor: 'rgba(245,158,11,0.1)',
                color: '#f59e0b',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Interrupt AI speech (barge-in)"
            >
              <Hand size={14} /> Interrupt
            </motion.button>
          )}
        </AnimatePresence>

        {/* Mic toggle */}
        <button
          onClick={toggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
            color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            boxShadow: isActive
              ? '0 0 12px color-mix(in srgb, var(--color-accent) 40%, transparent)'
              : 'var(--shadow-card)',
            transition: 'background-color 0.2s, box-shadow 0.2s',
          }}
          title={isActive ? 'Pause voice mode' : 'Resume voice mode'}
        >
          {isActive ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Hang up */}
        <button
          onClick={handleDisconnect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 16px',
            borderRadius: 'var(--radius-button)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-danger, #f44)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="End voice conversation"
        >
          <PhoneOff size={14} /> End
        </button>
      </div>
    </motion.div>
  );
}
