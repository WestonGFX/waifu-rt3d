import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface GreetingCardProps {
  /** The character's display name. */
  charName: string;
  /** The generated greeting text. */
  greeting: string;
  /** Detected emotion from the greeting generation. */
  emotion?: string;
  /** Called when the card is dismissed (user clicks X or sends a message). */
  onDismiss: () => void;
}

/**
 * Feature C4 — Companion Opening Greeting Card.
 *
 * Shows a contextual, LLM-generated greeting from the character when the user
 * opens the app. Fades in on mount, can be dismissed manually (X button) or
 * programmatically (parent calls onDismiss when the user sends their first
 * message). Does not appear when greeting_enabled is false on the character.
 *
 * @example
 * <GreetingCard
 *   charName="Sakura"
 *   greeting="Good morning... did you sleep okay?"
 *   emotion="affectionate"
 *   onDismiss={() => setShowGreeting(false)}
 * />
 */
export function GreetingCard({ charName, greeting, emotion, onDismiss }: GreetingCardProps) {
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    setVisible(false);
    // Let exit animation finish before notifying parent
    setTimeout(onDismiss, 300);
  };

  // Auto-dismiss after 12 seconds
  useEffect(() => {
    const t = setTimeout(handleDismiss, 12000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emotionColor: Record<string, string> = {
    happy: 'var(--color-accent)',
    affectionate: '#e0a0c8',
    playful: '#a0c8e0',
    sad: '#8090b8',
    surprised: '#c8a050',
    neutral: 'var(--color-text-tertiary)',
    confused: 'var(--color-text-secondary)',
  };
  const dotColor = emotion ? (emotionColor[emotion] ?? 'var(--color-accent)') : 'var(--color-accent)';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position: 'relative',
            margin: '8px 12px 4px',
            padding: '10px 36px 10px 12px',
            borderRadius: 10,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          {/* Emotion dot */}
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: dotColor,
              boxShadow: `0 0 6px ${dotColor}`,
            }}
          />
          {/* Name + text */}
          <p
            className="text-[11px] font-semibold pl-4 mb-0.5"
            style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}
          >
            {charName}
          </p>
          <p
            className="text-[12px] pl-4 leading-relaxed"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {greeting}
          </p>
          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: 2,
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="Dismiss greeting"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
