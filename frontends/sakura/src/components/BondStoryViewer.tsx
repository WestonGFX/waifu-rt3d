/**
 * BondStoryViewer — Full-screen visual novel reader for bond stories.
 *
 * Fetches a bond story from `/api/characters/:charId/bond/stories`, displays
 * it in a comfortable reading layout with VN-style dialogue highlighting, and
 * marks the story as viewed on close.
 *
 * Design notes:
 * - All colors resolved through CSS variables for cross-theme compatibility.
 * - Inline styles only — no Tailwind.
 * - Framer Motion for overlay enter/exit.
 * - Escape key and backdrop click both close the viewer.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Loader2, AlertCircle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Shape returned by `GET /api/characters/:charId/bond/stories` for a single
 * unlocked story entry.
 */
interface BondStory {
  /** Primary key in `bond_stories`. */
  id: number;
  /** Bond level the player must reach before this story unlocks. */
  bond_level_required: number;
  /** Human-readable title. */
  title: string;
  /** Prose/dialogue content; only present for unlocked stories. */
  scene_text?: string;
  /** Category of scene (e.g. "dialogue", "memory", "confession"). */
  scene_type: string;
  /** Whether the player's bond level meets the unlock threshold. */
  unlocked: boolean;
  /** Whether the player has already read this story. */
  viewed: boolean;
}

/**
 * Full API response shape from `GET /api/characters/:charId/bond/stories`.
 */
interface StoriesApiResponse {
  ok: boolean;
  stories: BondStory[];
}

/**
 * A single parsed block of story content derived from `scene_text`.
 * The `type` field drives visual treatment.
 */
interface StoryBlock {
  /** Unique render key. */
  key: string;
  /**
   * - `dialogue`    — line starting with a quote or matching `Speaker: text`
   * - `stage`       — line wrapped in `*…*` (action/stage direction)
   * - `prose`       — everything else
   */
  type: 'dialogue' | 'stage' | 'prose';
  /** Extracted speaker name for `dialogue` blocks; empty otherwise. */
  speaker: string;
  /** The display text (with speaker prefix stripped for dialogue). */
  text: string;
}

/**
 * Props for the {@link BondStoryViewer} overlay component.
 *
 * @example
 * <BondStoryViewer
 *   storyId={42}
 *   charId={3}
 *   charName="Aria"
 *   charAvatarUrl="/avatars/aria_thumb.webp"
 *   onClose={() => setOpenStory(null)}
 * />
 */
export interface BondStoryViewerProps {
  /** Primary key of the story to display. */
  storyId: number;
  /** Character whose story list is queried. */
  charId: number;
  /** Display name shown in the header and dialogue attribution. */
  charName: string;
  /** Optional avatar thumbnail shown beside the title. */
  charAvatarUrl?: string;
  /** Called after the viewed-mark API call completes (or on error). */
  onClose: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/** Regex: matches `Speaker: rest of line` with an optional leading space. */
const DIALOGUE_COLON_RE = /^\s*([A-Z][A-Za-z .'-]{0,24}):\s+(.+)$/;

/** Regex: matches lines starting with `"` or `'` (quoted speech). */
const DIALOGUE_QUOTE_RE = /^\s*["'"]/;

/** Regex: matches stage-direction lines wrapped in `*…*`. */
const STAGE_RE = /^\s*\*(.+)\*\s*$/;

/**
 * Parses raw `scene_text` into an ordered array of typed story blocks.
 *
 * Splitting strategy:
 * 1. Split on double newlines to get paragraph groups.
 * 2. Within each group, split on single newlines so every line is tested.
 * 3. Classify each non-empty line as `dialogue`, `stage`, or `prose`.
 * 4. Adjacent `prose` lines are merged back into a single paragraph block.
 *
 * @param sceneText - Raw story string from the API.
 * @returns Ordered array of {@link StoryBlock} objects.
 */
function parseSceneText(sceneText: string): StoryBlock[] {
  const paragraphs = sceneText.split(/\n{2,}/);
  const blocks: StoryBlock[] = [];
  let proseBuf: string[] = [];
  let keyIdx = 0;

  const flushProse = () => {
    if (proseBuf.length === 0) return;
    blocks.push({
      key:     `prose-${keyIdx++}`,
      type:    'prose',
      speaker: '',
      text:    proseBuf.join(' ').trim(),
    });
    proseBuf = [];
  };

  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const stageMatch = STAGE_RE.exec(line);
      if (stageMatch) {
        flushProse();
        blocks.push({
          key:     `stage-${keyIdx++}`,
          type:    'stage',
          speaker: '',
          text:    stageMatch[1].trim(),
        });
        continue;
      }

      const colonMatch = DIALOGUE_COLON_RE.exec(line);
      if (colonMatch) {
        flushProse();
        blocks.push({
          key:     `dia-${keyIdx++}`,
          type:    'dialogue',
          speaker: colonMatch[1].trim(),
          text:    colonMatch[2].trim(),
        });
        continue;
      }

      if (DIALOGUE_QUOTE_RE.test(line)) {
        flushProse();
        blocks.push({
          key:     `dia-${keyIdx++}`,
          type:    'dialogue',
          speaker: '',
          text:    line,
        });
        continue;
      }

      // Accumulate prose lines into a paragraph buffer
      proseBuf.push(line);
    }
    // Each double-newline boundary flushes an accumulated prose paragraph
    flushProse();
  }

  flushProse();
  return blocks;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders a single parsed story block with type-appropriate visual styling.
 *
 * - `prose`    — normal paragraph text
 * - `dialogue` — indented with accent left-border; speaker name in accent color
 * - `stage`    — italic, muted, centered — for action/scene descriptions
 *
 * @param block - The {@link StoryBlock} to render.
 */
function StoryBlockRow({ block }: { block: StoryBlock }) {
  if (block.type === 'stage') {
    return (
      <p
        style={{
          margin: '0.4em 0',
          fontStyle: 'italic',
          color: 'var(--color-text-tertiary)',
          fontSize: '0.90rem',
          lineHeight: 1.6,
          textAlign: 'center',
          opacity: 0.8,
        }}
      >
        {block.text}
      </p>
    );
  }

  if (block.type === 'dialogue') {
    return (
      <div
        style={{
          margin: '0.55em 0',
          paddingLeft: '14px',
          borderLeft: '3px solid var(--color-accent)',
        }}
      >
        {block.speaker && (
          <span
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--color-accent)',
              letterSpacing: '0.04em',
              marginBottom: '2px',
              textTransform: 'uppercase',
            }}
          >
            {block.speaker}
          </span>
        )}
        <p
          style={{
            margin: 0,
            fontSize: '1rem',
            color: 'var(--color-text)',
            lineHeight: 1.7,
          }}
        >
          {block.text}
        </p>
      </div>
    );
  }

  // prose
  return (
    <p
      style={{
        margin: '0.6em 0',
        fontSize: '1rem',
        color: 'var(--color-text)',
        lineHeight: 1.7,
      }}
    >
      {block.text}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BondStoryViewer
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay that presents a bond story in a visual novel reading
 * layout.
 *
 * Lifecycle:
 * 1. On mount: `GET /api/characters/:charId/bond/stories` → find `storyId`.
 * 2. Renders `scene_text` as typed blocks with VN-style formatting.
 * 3. On close (button, Escape, or backdrop): `POST …/stories/:storyId/view`
 *    then calls `onClose()`.
 *
 * @param props - See {@link BondStoryViewerProps}.
 *
 * @example
 * <BondStoryViewer
 *   storyId={7}
 *   charId={2}
 *   charName="Lyra"
 *   onClose={() => setActiveStory(null)}
 * />
 */
export function BondStoryViewer({
  storyId,
  charId,
  charName,
  charAvatarUrl,
  onClose,
}: BondStoryViewerProps) {
  const [story, setStory] = useState<BondStory | null>(null);
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // ── Fetch story on mount ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const fetchStory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/characters/${charId}/bond/stories`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StoriesApiResponse = await res.json();
        if (cancelled) return;

        const found = data.stories.find(s => s.id === storyId) ?? null;
        if (!found) {
          setError('Story not found.');
        } else if (!found.unlocked) {
          setError('This story has not been unlocked yet.');
        } else {
          setStory(found);
          setBlocks(parseSceneText(found.scene_text ?? ''));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load story.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStory();
    return () => { cancelled = true; };
  }, [charId, storyId]);

  // ── Mark viewed + close ─────────────────────────────────────────────────

  /**
   * Marks the story as viewed via the API and then invokes `onClose`.
   * Ignores API errors — the viewer should still close even if the mark fails.
   */
  const handleClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    try {
      await fetch(`/api/characters/${charId}/bond/stories/${storyId}/view`, {
        method: 'POST',
      });
    } catch {
      // Non-fatal: still close
    }
    onClose();
  }, [charId, storyId, onClose, closing]);

  // ── Keyboard shortcut ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {/* ── Backdrop ──────────────────────────────────────────────────── */}
      <motion.div
        key="bond-story-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
        aria-label="Close story viewer"
      >
        {/* ── Content panel ─────────────────────────────────────────── */}
        <motion.div
          key="bond-story-panel"
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{    opacity: 0, y: 24, scale: 0.97  }}
          transition={{ type: 'spring', damping: 24, stiffness: 280, delay: 0.04 }}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={story ? `Bond story: ${story.title}` : 'Bond story'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80vh',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border-subtle)',
              flexShrink: 0,
            }}
          >
            {/* Avatar */}
            {charAvatarUrl ? (
              <img
                src={charAvatarUrl}
                alt={charName}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '2px solid var(--color-accent)',
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--color-accent)',
                }}
              >
                <BookOpen size={16} />
              </div>
            )}

            {/* Title + character name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  lineHeight: 1,
                  marginBottom: '3px',
                }}
              >
                {charName}
              </p>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {story ? story.title : loading ? 'Loading…' : 'Bond Story'}
              </h2>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close story viewer"
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--color-bg-secondary)';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--color-text)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'transparent';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--color-text-secondary)';
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────── */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 28px',
              minHeight: 0,
            }}
          >
            {loading && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '48px 0',
                  color: 'var(--color-text-secondary)',
                }}
                aria-live="polite"
                aria-label="Loading story"
              >
                <Loader2
                  size={24}
                  style={{
                    animation: 'spin 1s linear infinite',
                    color: 'var(--color-accent)',
                  }}
                />
                <span style={{ fontSize: '0.875rem' }}>Loading story…</span>
              </div>
            )}

            {!loading && error && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '48px 0',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                }}
                role="alert"
              >
                <AlertCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
              </div>
            )}

            {!loading && !error && story && (
              <article aria-label={story.title}>
                {/* Scene type badge */}
                {story.scene_type && (
                  <p
                    style={{
                      margin: '0 0 20px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {story.scene_type.replace(/_/g, ' ')}
                    {' · '}
                    <span style={{ color: 'var(--color-accent)', opacity: 0.8 }}>
                      Bond Level {story.bond_level_required}
                    </span>
                  </p>
                )}

                {/* Story blocks */}
                {blocks.length > 0 ? (
                  blocks.map(block => (
                    <StoryBlockRow key={block.key} block={block} />
                  ))
                ) : (
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--color-text-secondary)',
                      fontStyle: 'italic',
                      fontSize: '0.9rem',
                    }}
                  >
                    No content available for this story.
                  </p>
                )}
              </article>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div
            style={{
              flexShrink: 0,
              padding: '14px 20px',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              aria-label="Mark as read and close"
              style={{
                padding: '9px 24px',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                background: 'var(--color-accent-gradient, var(--color-accent))',
                color: '#fff',
                cursor: closing ? 'default' : 'pointer',
                opacity: closing ? 0.7 : 1,
                letterSpacing: '0.03em',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
              }}
              onMouseEnter={e => {
                if (!closing) {
                  (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = closing ? '0.7' : '1';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              {closing ? (
                <Loader2
                  size={14}
                  style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                />
              ) : (
                <BookOpen size={14} style={{ flexShrink: 0 }} />
              )}
              Mark as Read &amp; Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
