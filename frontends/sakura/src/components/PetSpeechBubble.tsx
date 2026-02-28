import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Mic, Gamepad2, X, Send } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────────

interface PetSpeechBubbleProps {
  /** Latest message from the character (shown in the bubble). */
  message: string;
  /** Character name (shown as label). */
  characterName: string;
  /** Character ID for quick reply API calls. */
  charId?: number;
  /** Session ID for maintaining chat continuity (uses char's active session). */
  sessionId?: number | null;
  /** Called when the user dismisses the bubble. */
  onDismiss: () => void;
  /** Called when the user wants to open the full chat window. */
  onOpenChat?: () => void;
  /** Called when a quick reply is sent and a response received. */
  onQuickReply?: (response: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────────

/**
 * Floating speech bubble and action menu for the Desktop Pet overlay.
 *
 * Appears when the user clicks on the character in pet mode. Shows:
 *   - The character's latest message (or a greeting)
 *   - Quick action buttons: Chat, Voice, Play, Dismiss
 *
 * The bubble is positioned at the top of the pet window, above the character.
 * It auto-dismisses after 5 seconds of no interaction.
 *
 * @param props - Message, character name, and action handlers.
 *
 * @example
 * <PetSpeechBubble
 *   message="Hey, what's up?"
 *   characterName="Sakura"
 *   onDismiss={() => setShowBubble(false)}
 *   onOpenChat={() => electronAPI?.openMainWindow()}
 * />
 */
export function PetSpeechBubble({
  message,
  characterName,
  charId,
  sessionId,
  onDismiss,
  onOpenChat,
  onQuickReply,
}: PetSpeechBubbleProps) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Send a quick reply via the chat API and update the bubble with the response.
   * Uses the non-streaming /api/chat endpoint for simplicity.
   */
  const handleQuickReply = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !charId || isSending) return;

    setIsSending(true);
    setInputValue('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, char_id: charId, session_id: sessionId || 1 }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || '';
        if (reply && onQuickReply) onQuickReply(reply);
      }
    } catch {
      // Network error — silently fail, pet window is non-critical
    } finally {
      setIsSending(false);
      setShowInput(false);
    }
  }, [inputValue, charId, sessionId, isSending, onQuickReply]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        maxWidth: 280,
        zIndex: 100,
      }}
    >
      {/* ── Message bubble ──────────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(15, 15, 25, 0.88)',
          backdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: '1px solid rgba(139, 92, 246, 0.3)',
          padding: '10px 14px',
          color: '#e8e4f0',
          fontSize: '0.82rem',
          lineHeight: 1.5,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 8px rgba(139, 92, 246, 0.15)',
        }}
      >
        {/* Character name label */}
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'rgba(139, 92, 246, 0.9)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {characterName}
        </div>

        {/* Message text */}
        <div style={{ wordBreak: 'break-word' }}>
          {message || `Hey! What's up? Click an action below.`}
        </div>

        {/* ── Bubble tail (triangle pointing down) ───────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgba(15, 15, 25, 0.88)',
          }}
        />
      </div>

      {/* ── Quick Reply Input ─────────────────────────────────────────── */}
      {showInput && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
            padding: '0 2px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickReply(); }}
            placeholder={isSending ? 'Sending...' : 'Quick reply...'}
            disabled={isSending}
            autoFocus
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: 10,
              border: '1px solid rgba(139, 92, 246, 0.3)',
              background: 'rgba(15, 15, 25, 0.85)',
              backdropFilter: 'blur(8px)',
              color: '#e8e4f0',
              fontSize: '0.78rem',
              outline: 'none',
            }}
          />
          <button
            onClick={handleQuickReply}
            disabled={isSending || !inputValue.trim()}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(139, 92, 246, 0.3)',
              background: 'rgba(139, 92, 246, 0.2)',
              color: 'rgba(200, 180, 255, 0.9)',
              cursor: isSending ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────── */}
      {!showInput && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <ActionButton
            icon={<MessageSquare size={14} />}
            label="Reply"
            onClick={() => {
              setShowInput(true);
              // Focus after state update + render
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          />
          <ActionButton
            icon={<Mic size={14} />}
            label="Voice"
            onClick={onOpenChat}
          />
          <ActionButton
            icon={<Gamepad2 size={14} />}
            label="Play"
            onClick={onOpenChat}
          />
          <ActionButton
            icon={<X size={14} />}
            label=""
            onClick={onDismiss}
            variant="dismiss"
          />
        </div>
      )}
    </motion.div>
  );
}

// ── Action Button ───────────────────────────────────────────────────────────────

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'dismiss';
}

function ActionButton({ icon, label, onClick, variant = 'default' }: ActionButtonProps) {
  const isDismiss = variant === 'dismiss';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: isDismiss ? '6px 8px' : '6px 12px',
        borderRadius: 10,
        border: `1px solid ${isDismiss ? 'rgba(255,255,255,0.15)' : 'rgba(139, 92, 246, 0.3)'}`,
        background: isDismiss ? 'rgba(255,255,255,0.06)' : 'rgba(139, 92, 246, 0.12)',
        color: isDismiss ? 'rgba(255,255,255,0.5)' : 'rgba(200, 180, 255, 0.9)',
        fontSize: '0.72rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        backdropFilter: 'blur(8px)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDismiss
          ? 'rgba(255,255,255,0.1)'
          : 'rgba(139, 92, 246, 0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isDismiss
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(139, 92, 246, 0.12)';
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
