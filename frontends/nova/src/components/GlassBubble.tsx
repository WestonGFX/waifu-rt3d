import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Star } from 'lucide-react';
import glass from '../styles/glass.module.css';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useNovaStore } from '../stores/novaStore';

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
 * Hover actions include a fork button (for conversation branching) and
 * a bookmark/star button (for saving messages to the bookmarks panel).
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

  /** Server-side message ID — required for fork and bookmark to work. */
  serverMessageId?: number;

  /** Callback when the user clicks the fork button. Receives the server message ID. */
  onFork?: (messageId: number) => void;

  /** Active session ID — needed to create bookmarks. */
  sessionId?: number | null;

  /** Active character ID — stored with the bookmark for filtering. */
  characterId?: number | null;
}

/** Spring config for chat bubble entrances — bouncier than UI panels. */
const bubbleSpring = { stiffness: 200, damping: 18 };

/** Shared inline style for the small hover-action buttons (fork, bookmark). */
const actionButtonBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 6,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.08)',
  color: 'var(--nova-text-secondary, rgba(255,255,255,0.5))',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 0.15s ease, color 0.15s ease',
};

export function GlassBubble({
  role,
  index = 0,
  children,
  characterName,
  noAnimation = false,
  serverMessageId,
  onFork,
  sessionId,
  characterId,
}: GlassBubbleProps) {
  const isUser = role === 'user';
  const [hovered, setHovered] = useState(false);

  /** Tracks the bookmark ID when this message is bookmarked, or null. */
  const [bookmarkId, setBookmarkId] = useState<number | null>(null);

  const addToast = useNovaStore((s) => s.addToast);

  /**
   * On mount, check if this message is already bookmarked so we can
   * show a filled star immediately. Only fires when we have a valid
   * server message ID.
   */
  useEffect(() => {
    if (serverMessageId == null) return;
    let cancelled = false;
    api.getBookmarkForMessage(serverMessageId)
      .then((res) => {
        if (!cancelled && res.bookmark) {
          setBookmarkId(res.bookmark.id);
        }
      })
      .catch(() => {
        // Non-critical — silently ignore bookmark check failures
      });
    return () => { cancelled = true; };
  }, [serverMessageId]);

  /**
   * Toggle the bookmark state for this message.
   * Creates a bookmark if none exists, or deletes the existing one.
   */
  const handleToggleBookmark = useCallback(async () => {
    if (serverMessageId == null || sessionId == null) return;

    try {
      if (bookmarkId != null) {
        // Un-bookmark
        await api.deleteBookmark(bookmarkId);
        setBookmarkId(null);
        addToast('Bookmark removed', 'info');
      } else {
        // Bookmark
        const res = await api.createBookmark(
          serverMessageId,
          sessionId,
          characterId ?? undefined,
        );
        setBookmarkId(res.bookmark.id);
        addToast('Message bookmarked', 'success');
      }
    } catch {
      addToast('Bookmark action failed', 'error');
    }
  }, [serverMessageId, sessionId, characterId, bookmarkId, addToast]);

  /** Whether the hover action buttons should be visible. */
  const showActions = hovered && serverMessageId != null;
  const showFork = showActions && onFork != null;
  const showBookmark = showActions && sessionId != null;

  const isBookmarked = bookmarkId != null;

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
        position: 'relative',
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* Hover action buttons — top-right corner */}
      {(showFork || showBookmark) && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          display: 'flex',
          gap: 2,
        }}>
          {/* Bookmark / star button */}
          {showBookmark && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleBookmark();
              }}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this message'}
              style={{
                ...actionButtonBase,
                color: isBookmarked
                  ? 'var(--nova-accent-primary, #ff8da1)'
                  : 'var(--nova-text-secondary, rgba(255,255,255,0.5))',
                background: isBookmarked
                  ? 'rgba(255, 141, 161, 0.15)'
                  : 'rgba(255, 255, 255, 0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isBookmarked
                  ? 'rgba(255, 141, 161, 0.25)'
                  : 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.color = 'var(--nova-accent-primary, #ff8da1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isBookmarked
                  ? 'rgba(255, 141, 161, 0.15)'
                  : 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = isBookmarked
                  ? 'var(--nova-accent-primary, #ff8da1)'
                  : 'var(--nova-text-secondary, rgba(255,255,255,0.5))';
              }}
            >
              <Star size={13} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          )}

          {/* Fork button */}
          {showFork && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFork!(serverMessageId!);
              }}
              title="Fork conversation from this message"
              style={actionButtonBase}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.color = 'var(--nova-accent-primary, #ff8da1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = 'var(--nova-text-secondary, rgba(255,255,255,0.5))';
              }}
            >
              <GitBranch size={13} />
            </button>
          )}
        </div>
      )}
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
