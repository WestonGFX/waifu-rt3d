import { motion } from 'framer-motion';
import glass from '../styles/glass.module.css';
import clsx from 'clsx';

/**
 * Glass-backed chat bubble for Companion mode.
 *
 * Character messages are left-aligned with a neutral glass background.
 * User messages are right-aligned with an accent-tinted glass.
 * Both use Framer Motion spring entrances with staggered delays to
 * create a cascading "messages appearing" effect.
 *
 * In Companion mode these float over the 3D viewer, so the character
 * visually shows through the frosted glass — creating genuine depth.
 *
 * @example
 * ```tsx
 * <GlassBubble role="assistant" index={0}>Hello! How are you?</GlassBubble>
 * <GlassBubble role="user" index={1}>I'm great, thanks!</GlassBubble>
 * ```
 */
interface GlassBubbleProps {
  /** Who sent this message. */
  role: 'user' | 'assistant';

  /** Position in the message list — used for stagger delay. */
  index?: number;

  /** Message content (plain text or React nodes for markdown). */
  children: React.ReactNode;

  /** Optional character name shown above assistant messages. */
  characterName?: string;

  /** Disable the entrance animation (e.g., for pre-loaded history). */
  noAnimation?: boolean;
}

/** Spring config for chat bubble entrances — bouncier than UI panels. */
const bubbleSpring = { stiffness: 200, damping: 18 };

export function GlassBubble({
  role,
  index = 0,
  children,
  characterName,
  noAnimation = false,
}: GlassBubbleProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      className={clsx(
        isUser ? glass.bubbleUser : glass.bubbleChar,
      )}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: isUser
          ? 'rgba(255,240,245,0.95)'
          : 'var(--nova-text-primary)',
        // Tail radius: smaller on the sender's side
        borderBottomRightRadius: isUser ? 4 : undefined,
        borderBottomLeftRadius: !isUser ? 4 : undefined,
      }}
      initial={noAnimation ? false : {
        opacity: 0,
        scale: 0.85,
        y: 12,
      }}
      animate={noAnimation ? undefined : {
        opacity: 1,
        scale: 1,
        y: 0,
      }}
      transition={noAnimation ? undefined : {
        type: 'spring',
        ...bubbleSpring,
        delay: index * 0.15,
      }}
    >
      {/* Character name header (assistant messages only) */}
      {!isUser && characterName && (
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--nova-accent-primary)',
          marginBottom: 4,
          letterSpacing: '0.02em',
        }}>
          {characterName}
        </div>
      )}

      {/* Message content */}
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        {children}
      </div>
    </motion.div>
  );
}

/**
 * Typing indicator — three bouncing dots in a glass bubble.
 * Shows when the character is "thinking" (SSE stream started but no tokens yet).
 */
export function TypingIndicator({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className={glass.bubbleChar}
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        gap: 5,
        padding: '12px 18px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottomLeftRadius: 4,
      }}
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', ...bubbleSpring, delay }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--nova-accent-pink)',
          }}
          animate={{
            y: [0, -6, 0],
            opacity: [0.3, 0.9, 0.3],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.div>
  );
}
