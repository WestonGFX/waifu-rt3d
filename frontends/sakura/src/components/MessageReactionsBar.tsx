import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface Reaction {
  id: number;
  emoji: string;
  /** ISO timestamp string from the server. */
  ts: string;
}

/** A grouped reaction pill: the emoji and how many times it appears. */
interface ReactionGroup {
  emoji: string;
  count: number;
  /** ID of the most recent reaction of this emoji (used for DELETE). */
  latestId: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Fixed emoji options shown in the quick-picker dropdown. */
const EMOJI_PICKER_LIST: readonly string[] = [
  '👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '✨', '💯', '🎉',
];

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Convert a raw array of reaction objects into grouped pills.
 * Reactions are grouped by emoji; the `latestId` tracks the most recently
 * created reaction so the DELETE call removes the correct row.
 *
 * @param reactions - Raw reaction list from the API.
 * @returns Array of grouped reaction pills sorted by first appearance.
 */
function groupReactions(reactions: Reaction[]): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (!existing) {
      map.set(r.emoji, { emoji: r.emoji, count: 1, latestId: r.id });
    } else {
      // Keep the higher (most recent) id as the delete target
      map.set(r.emoji, {
        emoji: r.emoji,
        count: existing.count + 1,
        latestId: Math.max(existing.latestId, r.id),
      });
    }
  }
  return Array.from(map.values());
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/** Props for {@link MessageReactionsBar}. */
interface Props {
  /** Database ID of the message to show reactions for. */
  messageId: number;
  /** Whether the reactions row is currently visible (controlled by hover state). */
  visible: boolean;
}

/**
 * Inline emoji reactions bar for a single chat message.
 *
 * Displays grouped emoji pills with counts, fetched from
 * GET /api/messages/{messageId}/reactions.
 *
 * Interactions:
 * - Click an existing pill → DELETE the most recent reaction of that emoji
 * - Click "+" → open a compact emoji picker dropdown
 * - Click an emoji in the picker → POST a new reaction
 *
 * The bar fades in/out via Framer Motion based on the `visible` prop.
 * All network calls use the native fetch() API.
 *
 * @example
 * <MessageReactionsBar messageId={42} visible={isHovered} />
 */
export function MessageReactionsBar({ messageId, visible }: Props) {
  const [groups, setGroups] = useState<ReactionGroup[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch reactions whenever the messageId changes
  useEffect(() => {
    if (!messageId) return;

    let cancelled = false;

    fetch(`/api/messages/${messageId}/reactions`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('fetch failed')))
      .then((data: unknown) => {
        if (cancelled) return;
        // The API should return an array; guard against malformed responses
        if (Array.isArray(data)) {
          setGroups(groupReactions(data as Reaction[]));
        }
      })
      .catch(() => {
        // Silently ignore: reactions are non-critical UI
      });

    return () => { cancelled = true; };
  }, [messageId]);

  // Close the picker when clicking outside it
  useEffect(() => {
    if (!pickerOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  /**
   * Delete the most recent reaction for the given emoji group.
   *
   * @param group - The reaction group to remove one instance from.
   */
  const handleDeleteReaction = async (group: ReactionGroup) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/messages/${messageId}/reactions/${group.latestId}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        // Optimistically update: decrement count or remove the group
        setGroups(prev =>
          prev
            .map(g =>
              g.emoji === group.emoji
                ? { ...g, count: g.count - 1 }
                : g,
            )
            .filter(g => g.count > 0),
        );
      }
    } catch {
      // Non-fatal: UI stays consistent on next refetch
    } finally {
      setBusy(false);
    }
  };

  /**
   * Post a new reaction emoji for this message.
   *
   * @param emoji - The emoji string to record.
   */
  const handleAddReaction = async (emoji: string) => {
    setPickerOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const newReaction = await res.json() as Reaction;
        setGroups(prev => {
          const existing = prev.find(g => g.emoji === emoji);
          if (existing) {
            return prev.map(g =>
              g.emoji === emoji
                ? { ...g, count: g.count + 1, latestId: newReaction.id }
                : g,
            );
          }
          return [...prev, { emoji, count: 1, latestId: newReaction.id }];
        });
      }
    } catch {
      // Non-fatal
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="reactions-bar"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            flexWrap: 'wrap',
            marginTop: '4px',
            position: 'relative',
          }}
        >
          {/* Existing reaction pills */}
          {groups.map(group => (
            <button
              key={group.emoji}
              onClick={() => handleDeleteReaction(group)}
              title={`Remove ${group.emoji} reaction`}
              disabled={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 7px',
                borderRadius: '99px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                lineHeight: 1.4,
                color: 'var(--color-text-secondary)',
                transition: 'background-color 0.12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))';
              }}
            >
              <span>{group.emoji}</span>
              {group.count > 1 && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                  {group.count}
                </span>
              )}
            </button>
          ))}

          {/* Add reaction button + picker */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setPickerOpen(prev => !prev)}
              aria-label="Add reaction"
              title="Add reaction"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '99px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                padding: 0,
              }}
            >
              <Plus size={12} />
            </button>

            {/* Emoji picker dropdown */}
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  key="emoji-picker"
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    bottom: '28px',
                    left: 0,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    padding: '8px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    zIndex: 60,
                    width: '148px',
                  }}
                >
                  {EMOJI_PICKER_LIST.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => handleAddReaction(emoji)}
                      title={`React with ${emoji}`}
                      style={{
                        fontSize: '16px',
                        lineHeight: 1,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'var(--color-accent-soft)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
