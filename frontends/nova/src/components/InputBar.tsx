import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, Mic } from 'lucide-react';
import glass from '../styles/glass.module.css';

/**
 * Glass-backed chat input bar.
 *
 * Floats at the bottom of the chat panel with a rounded pill shape.
 * Features a gradient send button (pink→peach), optional voice toggle,
 * and a subtle glow on focus. Springs in from below on mount.
 *
 * The input expands vertically for multi-line messages (up to 4 lines)
 * using a textarea that auto-resizes.
 *
 * @param onSend - Called with the message text when user sends
 * @param onVoiceToggle - Called when voice button is pressed
 * @param disabled - Disables input while streaming
 * @param placeholder - Custom placeholder text
 */
interface InputBarProps {
  onSend: (text: string) => void;
  onVoiceToggle?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  onSend,
  onVoiceToggle,
  disabled = false,
  placeholder = 'Say something...',
}: InputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Cap at ~4 lines (4 * 20px line height ≈ 80px)
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, []);

  return (
    <motion.div
      className={glass.panelStrong}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        padding: '10px 12px 10px 18px',
        borderRadius: 26,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.8 }}
      // Focus glow handled via CSS-in-JS since :focus-within needs the container
      onFocus={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'rgba(255,141,161,0.25)';
        el.style.boxShadow = '0 0 24px rgba(255,141,161,0.06)';
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }}
    >
      {/* Text input */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13.5,
          lineHeight: '20px',
          color: 'var(--nova-text-primary)',
          caretColor: 'var(--nova-accent-pink)',
          resize: 'none',
          minHeight: 20,
          maxHeight: 80,
        }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        {/* Voice toggle */}
        {onVoiceToggle && (
          <button
            onClick={onVoiceToggle}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,141,161,0.12)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Mic size={18} strokeWidth={1.5} color="var(--nova-text-secondary)" />
          </button>
        )}

        {/* Send button — gradient accent */}
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: text.trim() && !disabled
              ? 'linear-gradient(135deg, var(--nova-accent-pink), var(--nova-accent-secondary))'
              : 'rgba(255,141,161,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: text.trim() && !disabled ? 'pointer' : 'default',
            transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
            boxShadow: text.trim() && !disabled ? '0 2px 12px rgba(255,141,161,0.2)' : 'none',
            opacity: text.trim() && !disabled ? 1 : 0.5,
          }}
          onMouseEnter={(e) => {
            if (text.trim() && !disabled) {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,141,161,0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = text.trim() && !disabled
              ? '0 2px 12px rgba(255,141,161,0.2)'
              : 'none';
          }}
        >
          <Send size={18} strokeWidth={2} color="white" />
        </button>
      </div>
    </motion.div>
  );
}
