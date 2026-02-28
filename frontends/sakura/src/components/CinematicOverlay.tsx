/**
 * CinematicOverlay — Feature B1: Cinematic Immersion Mode
 *
 * A fixed-position overlay that renders over the full-screen VRM viewer.
 * Shows the last 4 messages as translucent VN-style dialogue bubbles with
 * a minimal chat input at the bottom. The VRM model is visible through the
 * semi-transparent background — no separate viewer needed.
 *
 * Activated by Ctrl+I. Exits on ESC or clicking the X button.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../lib/types';

/** Max messages to display in the VN dialogue feed. */
const MAX_VISIBLE = 4;

export function CinematicOverlay() {
  const { toggleCinematicMode, activeCharacter } = useAppStore();
  const { messages, loading, sendMessage } = useChatStore();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Show the last N messages in the overlay
  const visibleMessages = messages.slice(-MAX_VISIBLE);

  // Focus input when overlay opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC to exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleCinematicMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCinematicMode]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || loading) return;
    sendMessage(inputValue.trim());
    setInputValue('');
  }, [inputValue, loading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charName = activeCharacter?.name ?? 'Character';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {/* Gradient vignette at bottom — darkens the lower third for readability */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top-right exit button */}
      <button
        onClick={toggleCinematicMode}
        style={{
          position: 'absolute', top: 16, right: 16,
          backgroundColor: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '6px 10px',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em',
          pointerEvents: 'auto',
          backdropFilter: 'blur(6px)',
        }}
        title="Exit cinematic mode (ESC)"
      >
        <X size={12} />
        EXIT
      </button>

      {/* Dialogue feed + input */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: '0 32px 20px',
          pointerEvents: 'none',
        }}
      >
        {/* Last N messages */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <AnimatePresence initial={false}>
            {visibleMessages.map((msg, i) => (
              <CinematicBubble
                key={msg.id ?? `${msg.role}-${i}`}
                message={msg}
                charName={charName}
                faded={i < visibleMessages.length - 2}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Input row */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 6,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              flex: 1, display: 'flex', alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 10, padding: '8px 12px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Say something to ${charName}…`}
              rows={1}
              style={{
                flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '0.9rem', fontFamily: 'var(--font-body)',
                lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
              }}
              disabled={loading}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || loading}
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              border: 'none', borderRadius: 10,
              padding: '10px 14px', cursor: 'pointer',
              pointerEvents: 'auto',
              opacity: !inputValue.trim() || loading ? 0.45 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single dialogue bubble in the cinematic feed. */
function CinematicBubble({
  message,
  charName,
  faded,
}: {
  message: ChatMessage;
  charName: string;
  faded: boolean;
}) {
  const isAssistant = message.role === 'assistant';
  const speaker = isAssistant ? charName : 'You';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: faded ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      style={{
        maxWidth: '70%',
        alignSelf: isAssistant ? 'flex-start' : 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {/* Speaker label */}
      <div
        style={{
          fontSize: '0.62rem', fontWeight: 700,
          color: isAssistant ? 'var(--color-accent)' : 'rgba(255,255,255,0.5)',
          marginBottom: 3,
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          textAlign: isAssistant ? 'left' : 'right',
          letterSpacing: '0.04em',
        }}
      >
        {speaker}
      </div>
      {/* Bubble */}
      <div
        style={{
          backgroundColor: isAssistant
            ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.12)',
          border: isAssistant
            ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.2)',
          borderRadius: isAssistant ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          padding: '8px 12px',
          backdropFilter: 'blur(6px)',
          color: 'rgba(255,255,255,0.92)',
          fontSize: '0.88rem',
          lineHeight: 1.55,
          fontFamily: 'var(--font-body)',
        }}
      >
        {message.text ?? ''}
      </div>
    </motion.div>
  );
}
