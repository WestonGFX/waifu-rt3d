/**
 * VNTextBox — Feature B3: Visual Novel Text Box
 *
 * Renders the last assistant message in a styled visual novel text box at the
 * bottom of the VN reading mode layout.  Animates the text character-by-character
 * using rAF for buttery-smooth typewriter effect.  Clicking the box or pressing
 * Space/Enter skips to the full text instantly.
 *
 * Also handles user messages: shown as a compact "You said:" pill above the box.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/types';

const CHARS_PER_FRAME = 2;   // characters revealed per animation frame
const MS_PER_FRAME    = 20;  // target ~50fps

interface Props {
  /** The latest message to display. */
  message: ChatMessage | undefined;
  /** Character name label (shown in the name tag). */
  charName: string;
  /** Called when the user is ready to advance (click or Space/Enter). */
  onAdvance?: () => void;
}

/**
 * Animated VN dialogue text box with speaker name tag and typewriter reveal.
 *
 * @example
 * <VNTextBox message={lastMessage} charName="Sakura" onAdvance={() => ...} />
 */
export function VNTextBox({ message, charName, onAdvance }: Props) {
  const [visibleChars, setVisibleChars] = useState(0);
  const [complete, setComplete] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const fullText = message?.text ?? '';
  const isAssistant = message?.role === 'assistant';
  const speaker = isAssistant ? charName : 'You';

  // ── Typewriter animation ─────────────────────────────────────────────────

  useEffect(() => {
    setVisibleChars(0);
    setComplete(false);
    if (!fullText) return;

    let chars = 0;

    const animate = (ts: number) => {
      if (ts - lastFrameRef.current >= MS_PER_FRAME) {
        chars = Math.min(chars + CHARS_PER_FRAME, fullText.length);
        setVisibleChars(chars);
        lastFrameRef.current = ts;
        if (chars >= fullText.length) {
          setComplete(true);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [fullText]);

  /** Skip to the full text immediately. */
  const skip = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setVisibleChars(fullText.length);
    setComplete(true);
    if (complete && onAdvance) onAdvance();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); skip(); }
  };

  const displayedText = fullText.slice(0, visibleChars);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={skip}
      onKeyDown={handleKeyDown}
      aria-label={`${speaker}: ${displayedText}`}
      style={{
        position: 'relative',
        cursor: complete ? 'default' : 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Name tag */}
      <div
        className="char-name-display"
        style={{
          display: 'inline-block',
          padding: '3px 14px 3px 10px',
          backgroundColor: isAssistant
            ? 'color-mix(in srgb, var(--color-accent) 85%, transparent)'
            : 'rgba(255,255,255,0.18)',
          color: '#fff',
          fontSize: '0.82rem',
          fontWeight: 600,
          borderRadius: '8px 8px 0 0',
          letterSpacing: '0.06em',
          marginBottom: 0,
          lineHeight: 1.5,
          backdropFilter: 'blur(4px)',
          clipPath: 'inset(0 0 -4px 0)',
        }}
      >
        {speaker}
      </div>

      {/* Dialogue box */}
      <div
        style={{
          backgroundColor: 'rgba(12,8,20,0.82)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '0 12px 12px 12px',
          padding: '14px 18px 16px',
          backdropFilter: 'blur(10px)',
          minHeight: 96,
          position: 'relative',
        }}
      >
        <p
          style={{
            margin: 0,
            color: 'rgba(255,255,255,0.93)',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {displayedText}
          {/* Blinking cursor while typing */}
          {!complete && (
            <span
              style={{
                display: 'inline-block',
                width: '0.1em',
                height: '1em',
                backgroundColor: 'var(--color-accent)',
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                animation: 'blink 0.8s step-end infinite',
              }}
            />
          )}
        </p>

        {/* Advance indicator ▾ — only shown when animation is complete */}
        {complete && onAdvance && (
          <span
            style={{
              position: 'absolute',
              bottom: 10,
              right: 14,
              color: 'var(--color-accent)',
              fontSize: '0.7rem',
              animation: 'blink 1.2s ease-in-out infinite',
              fontWeight: 700,
            }}
          >
            ▾
          </span>
        )}
      </div>
    </div>
  );
}
