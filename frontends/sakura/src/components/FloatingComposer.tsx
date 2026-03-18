/**
 * FloatingComposer — a glassmorphic chat input that floats inside the 3D
 * ModelPanel viewport, letting users send messages without leaving the 3D
 * view context. Supports normal chat, director notes, reply-length control,
 * and abort-on-demand.
 *
 * @module FloatingComposer
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAppStore, ReplyLengthMode } from '../stores/appStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Props for the FloatingComposer component. */
interface FloatingComposerProps {
  /** Whether the composer is visible. Controls AnimatePresence mount/unmount. */
  visible: boolean;
  /** Called when the user presses Escape or requests dismissal. */
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maps a ReplyLengthMode to a max_tokens value for the LLM.
 * `undefined` means no override — the backend uses its own default.
 */
const REPLY_LENGTH_TOKENS: Record<ReplyLengthMode, number | undefined> = {
  brief: 150,
  normal: undefined,
  detailed: 800,
  auto: undefined,
};

/** Display labels for each reply length mode, shown in the compact pill. */
const REPLY_LENGTH_LABELS: Record<ReplyLengthMode, string> = {
  brief: 'Brief',
  normal: 'Norm',
  detailed: 'Long',
  auto: 'Auto',
};

/** Ordered cycle for clicking through reply length modes. */
const REPLY_LENGTH_CYCLE: ReplyLengthMode[] = ['brief', 'normal', 'detailed', 'auto'];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Floating glassmorphic chat input rendered inside the 3D model viewport.
 *
 * Renders at the bottom-centre of its nearest `position: relative` ancestor
 * (the ModelPanel). Supports normal chat messages and director notes, with
 * inline reply-length cycling and abort control.
 *
 * @param props.visible - When false the component animates out and unmounts.
 * @param props.onClose - Callback invoked on Escape keypress.
 *
 * @example
 * <FloatingComposer visible={composerOpen} onClose={() => setComposerOpen(false)} />
 */
export function FloatingComposer({ visible, onClose }: FloatingComposerProps) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const loading = useChatStore((s) => s.loading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendDirectorNote = useChatStore((s) => s.sendDirectorNote);
  const abortMessage = useChatStore((s) => s.abortMessage);
  const directorMode = useChatStore((s) => s.directorMode);

  const replyLengthMode = useAppStore((s) => s.replyLengthMode);
  const setReplyLengthMode = useAppStore((s) => s.setReplyLengthMode);
  const incognito = useAppStore((s) => s.incognito);

  // ── Floating message bubbles ─────────────────────────────────────────
  const messages = useChatStore((s) => s.messages);
  const recentAssistant = messages.filter(m => m.role === 'assistant').slice(-3);
  const [showBubbles, setShowBubbles] = useState(true);

  // Auto-dismiss bubbles after 15s of no new messages
  useEffect(() => {
    if (recentAssistant.length === 0) return;
    setShowBubbles(true);
    const timer = setTimeout(() => setShowBubbles(false), 15_000);
    return () => clearTimeout(timer);
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Auto-focus the textarea whenever the composer becomes visible.
  useEffect(() => {
    if (visible) {
      // Small delay so AnimatePresence finishes the enter animation first.
      const id = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [visible]);

  // Auto-resize the textarea height as the draft grows.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [draft]);

  /**
   * Send the current draft as either a director note or a chat message,
   * then clear the draft. Does nothing when the draft is blank or a request
   * is already in flight.
   *
   * Director notes bypass the LLM and are stored directly in the DB.
   * Normal messages respect the active reply-length setting for token budget.
   */
  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || loading) return;

    if (directorMode) {
      void sendDirectorNote(trimmed);
    } else {
      const maxTokens = REPLY_LENGTH_TOKENS[replyLengthMode];
      void sendMessage(trimmed, true, incognito, maxTokens);
    }
  }, [draft, loading, directorMode, sendDirectorNote, sendMessage, incognito, replyLengthMode]);

  /** Cycle to the next reply length mode in the defined order. */
  const cycleReplyLength = useCallback(() => {
    const idx = REPLY_LENGTH_CYCLE.indexOf(replyLengthMode);
    const next = REPLY_LENGTH_CYCLE[(idx + 1) % REPLY_LENGTH_CYCLE.length];
    setReplyLengthMode(next);
  }, [replyLengthMode, setReplyLengthMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, onClose]
  );

  // ── Derived style values ───────────────────────────────────────────────────

  const borderColor = directorMode
    ? '#f59e0b'
    : focused
    ? 'var(--color-accent)'
    : 'var(--color-border)';

  const sendBtnBackground = loading
    ? 'var(--color-danger, #ef4444)'
    : 'linear-gradient(135deg, var(--color-accent), var(--color-accent-alt, var(--color-accent)))';

  const canSend = draft.trim().length > 0 && !loading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute',
            bottom: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(90%, 420px)',
            zIndex: 20,
            background: 'color-mix(in srgb, var(--color-surface) 75%, transparent)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${borderColor}`,
            borderRadius: 12,
            padding: '8px 10px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
            transition: 'border-color 0.15s ease',
          }}
        >
          {/* Floating message bubbles — last 2-3 assistant replies */}
          <AnimatePresence>
            {showBubbles && recentAssistant.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}
              >
                {recentAssistant.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      fontSize: 11, lineHeight: '1.3',
                      padding: '4px 10px', borderRadius: 8,
                      background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '100%', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={msg.text}
                  >
                    {msg.text.length > 120 ? msg.text.slice(0, 120) + '...' : msg.text}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={directorMode ? "Director's note..." : 'Message...'}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--color-text)',
                resize: 'none',
                fontFamily: 'inherit',
                fontSize: '0.82rem',
                lineHeight: '1.45',
                width: '100%',
                maxHeight: 80,
                overflow: 'auto',
                paddingTop: 2,
                paddingBottom: 2,
              }}
            />

            {/* Send / Abort button */}
            <button
              onClick={loading ? abortMessage : handleSend}
              disabled={!loading && !canSend}
              title={loading ? 'Cancel' : 'Send (Enter)'}
              aria-label={loading ? 'Cancel response' : 'Send message'}
              style={{
                background: loading || canSend ? sendBtnBackground : 'var(--color-surface-raised, var(--color-surface))',
                border: 'none',
                cursor: loading || canSend ? 'pointer' : 'not-allowed',
                borderRadius: 8,
                width: 32,
                height: 32,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !loading && !canSend ? 0.4 : 1,
                transition: 'opacity 0.15s ease, background 0.15s ease',
              }}
            >
              {loading ? (
                <Square size={14} color="#fff" />
              ) : (
                <Send size={14} color={canSend ? '#fff' : 'var(--color-text-tertiary)'} />
              )}
            </button>
          </div>

          {/* Badge row — reply length + director mode indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: 0.7,
            }}
          >
            {/* Reply length pill — click to cycle */}
            <button
              onClick={cycleReplyLength}
              title="Cycle reply length"
              aria-label={`Reply length: ${replyLengthMode}. Click to change.`}
              style={{
                background: 'var(--color-surface-raised, rgba(128,128,128,0.15))',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.03em',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                lineHeight: '1.5',
              }}
            >
              {REPLY_LENGTH_LABELS[replyLengthMode]}
            </button>

            {/* Director mode indicator — display only */}
            {directorMode && (
              <span
                aria-label="Director mode active"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: '#f59e0b',
                  lineHeight: '1.5',
                }}
              >
                DIR
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
