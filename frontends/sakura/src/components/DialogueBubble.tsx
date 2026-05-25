import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Volume2, Pin, ChevronLeft, ChevronRight, ChevronsRight, RefreshCw, Copy, Trash2, Pencil, Check, X, Clock } from 'lucide-react';
import type { ChatMessage, Character } from '../lib/types';
import { MessageMeta } from './MessageMeta';
import { ChatImageLightbox } from './ChatImageLightbox';
import { FeedbackButtons } from './FeedbackButtons';
import { downloadUrl } from '../lib/downloadFile';
import { api } from '../lib/api';
import { parseFull } from '../lib/parseActions';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/** Format a Unix-ms timestamp as a relative time string ("2 min ago", "just now"). */
function formatRelativeTime(ts: number): string {
  const diffS = Math.floor((Date.now() - ts) / 1000);
  if (diffS < 60) return 'just now';
  if (diffS < 3600) return `${Math.floor(diffS / 60)} min ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

/**
 * Canonical 26-emotion emoji map (Phase 15).
 * Covers all 6 categories: Core, Social, Cognitive, Romantic, Energy, Playful.
 */
const EMOTION_EMOJI: Record<string, string> = {
  // Core (Ekman+)
  happy: '😊', sad: '🥺', angry: '😤', surprised: '😮',
  fearful: '😨', disgusted: '🤢', neutral: '',
  // Social
  embarrassed: '😳', shy: '🫣', proud: '😎', confident: '😏',
  jealous: '😑', grateful: '🙏',
  // Cognitive
  confused: '😕', curious: '🧐', thoughtful: '🤔', nostalgic: '😌', awe: '🤩',
  // Romantic
  love: '❤️', flirty: '😉', longing: '😔',
  // Energy
  excited: '✨', tired: '😴', relieved: '😌',
  // Playful
  smug: '😏', mischievous: '😈',
};

/**
 * Cache of available expression portraits per character.
 * Populated lazily on first render of an assistant message for a character
 * with `emotion_portraits_mode >= 1`. Keyed by character ID.
 */
const portraitCache: Record<number, Record<string, string>> = {};

/** Image extensions the browser can render in an img tag. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/** Returns true if the URL points to a renderable image (not VRM/3D model). */
function isImageUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return IMAGE_EXTS.test(new URL(url, window.location.origin).pathname);
  } catch {
    return IMAGE_EXTS.test(url);
  }
}

/** Resolve avatar with pixel portrait fallback (same as CharacterCard). */
function resolveAvatarUrl(name?: string, avatarUrl?: string): string | null {
  if (isImageUrl(avatarUrl)) return avatarUrl!;
  const parenMatch = name?.match(/\(([^)]+)\)/);
  const cleanName = parenMatch
    ? parenMatch[1].trim().toLowerCase()
    : (name?.split(/\s/)[0] || '').toLowerCase();
  if (cleanName) return `/files/images/${cleanName}_pixel_portrait.png`;
  return null;
}

/**
 * Resolve an emotion-specific portrait URL for a character.
 *
 * Checks the portrait cache (populated from the Phase 15 expression portraits API)
 * for an image matching the message's emotion. Falls back to the standard avatar
 * if no emotion portrait exists or if the feature is disabled.
 *
 * @param charId - Character database ID (used as cache key).
 * @param emotion - The detected emotion for this message.
 * @param fallbackUrl - Static avatar URL to use when no portrait matches.
 * @returns The portrait URL or the fallback.
 */
function resolveEmotionAvatarUrl(
  charId: number | undefined,
  emotion: string | undefined,
  fallbackUrl: string | null,
): string | null {
  if (!charId || !emotion || emotion === 'neutral') return fallbackUrl;
  const cache = portraitCache[charId];
  if (!cache) return fallbackUrl;
  return cache[emotion] ?? fallbackUrl;
}

interface DialogueBubbleProps {
  message: ChatMessage;
  character?: Character;
  onPlayAudio?: () => void;
  isPlaying?: boolean;
  searchQuery?: string;
  /** Feature E: called when the user clicks a dialogue choice button. */
  onChoiceSelect?: (choice: string) => void;
  /** T0-3: called when user clicks regenerate on an assistant message. */
  onRegenerate?: (serverMessageId: number) => void;
  /** Visual MVP P2: regenerate the inline image attached to this message. */
  onRegenerateImage?: (messageId: string) => void;
  /** T0-3: called when user navigates to a different branch.
   *  `localMessageId` is the store ID of the message being switched. */
  onBranchSwitch?: (newMessageId: number, newText: string, newEmotion?: string, localMessageId?: string) => void;
  /** Called when the user deletes a message. Receives the local message ID. */
  onDelete?: (messageId: string) => void;
  /** Called when the user edits a message. Receives local ID and new text. */
  onEdit?: (messageId: string, newText: string) => void;
  /** Whether this is the last assistant message — shows always-visible regen button. */
  isLastAssistant?: boolean;
  /** Whether this message is currently being regenerated — shows spinner. */
  isRegenerating?: boolean;
  /** Called to ask the character to continue their previous response. */
  onContinue?: () => void;
  /** Whether to show the 👍/👎 feedback buttons under assistant bubbles. */
  feedbackEnabled?: boolean;
}

/** Highlight occurrences of `query` inside `text` using <mark> spans. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', borderRadius: '2px', padding: '0 1px' }}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
}

/** Fenced code block with language label and one-click copy button. */
function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(body).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ position: 'relative', margin: '0.6em 0' }}>
      {lang && (
        <span style={{
          position: 'absolute', top: 6, left: 10,
          fontSize: '0.68rem', fontFamily: 'monospace',
          color: 'var(--color-text-tertiary)',
          pointerEvents: 'none',
        }}>
          {lang}
        </span>
      )}
      <button
        onClick={copy}
        title="Copy code"
        style={{
          position: 'absolute', top: 6, right: 6,
          background: copied ? 'var(--color-accent-soft)' : 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, padding: '2px 6px',
          fontSize: '0.68rem', cursor: 'pointer',
          color: copied ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          transition: 'all 0.15s',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: lang ? '24px 12px 10px' : '10px 12px',
        overflowX: 'auto', fontSize: '0.82rem',
        fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
        color: 'var(--color-text-primary)',
        margin: 0, lineHeight: 1.5,
      }}>
        <code>{body}</code>
      </pre>
    </div>
  );
}

/**
 * Renders message text with markdown: **bold**, *italic*-as-action,
 * (parenthetical narration), fenced code blocks, inline backtick code,
 * and paragraph breaks (double newline). Single newlines become <br>.
 * Search highlighting is preserved inside plain segments.
 */
function MarkdownText({ text, query }: { text: string; query: string }) {
  const tokens = parseFull(text);

  // Group consecutive non-code tokens into <p> blocks, emitting code blocks inline.
  const elements: React.ReactNode[] = [];
  let pBuf: React.ReactNode[] = [];
  let pKey = 0;

  const flushPara = () => {
    if (pBuf.length) {
      elements.push(<p key={`p${pKey++}`} style={{ margin: elements.length === 0 ? '0' : '0.55em 0 0' }}>{pBuf}</p>);
      pBuf = [];
    }
  };

  tokens.forEach((tok, ti) => {
    if (tok.type === 'code') {
      flushPara();
      elements.push(<CodeBlock key={`cb${ti}`} lang={tok.lang ?? ''} body={tok.text} />);
      return;
    }

    if (tok.type === 'inline_code') {
      pBuf.push(
        <code key={ti} style={{
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: '0.88em',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 3, padding: '1px 4px',
        }}>
          {tok.text}
        </code>
      );
      return;
    }

    // Inline tokens — split on \n\n for paragraph breaks, \n for <br>
    const paras = tok.text.split(/\n\n+/);
    paras.forEach((para, pi) => {
      if (pi > 0) { flushPara(); }
      const parts = para.split('\n');
      const inner = parts.map((part, si) => (
        <span key={`${ti}-${pi}-${si}`}>
          {query.trim() ? <HighlightedText text={part} query={query} /> : part}
          {si < parts.length - 1 && <br />}
        </span>
      ));
      if (tok.type === 'bold') pBuf.push(<strong key={`${ti}-${pi}`}>{inner}</strong>);
      else if (tok.type === 'italic') pBuf.push(<em key={`${ti}-${pi}`} style={{ color: 'var(--color-text-secondary)' }}>{inner}</em>);
      else if (tok.type === 'narration') pBuf.push(
        <span key={`${ti}-${pi}`} style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)', opacity: 0.85, fontSize: '0.93em' }}>
          ({inner})
        </span>
      );
      else pBuf.push(<span key={`${ti}-${pi}`}>{inner}</span>);
    });
  });

  flushPara();
  return <>{elements}</>;
}

/**
 * Skeleton placeholder shown while an assistant message is in `pending` status
 * (model prefill, before any token has streamed back). Renders three shimmering
 * placeholder lines, three animated dots, and a live elapsed-time counter
 * ("Thinking 14s") so the user knows the system is alive even when the model
 * takes 20-30s to produce a first token.
 *
 * Two render modes:
 * - `'skeleton'` (default): three shimmer lines + dots + counter
 * - `'stages'`: three labelled rows (Reading context / Thinking / Generating)
 *   driven by the SSE-event-derived `stage` field on the message.
 *
 * @param charName  - Character display name, used in the aria-label.
 * @param startedAt - Epoch ms when the assistant message was created. Powers
 *                    the elapsed counter via setInterval.
 * @param stage     - 'processing' | 'generating' | undefined. Drives the
 *                    stages-mode progression. Optional — skeleton mode ignores it.
 * @param mode      - 'skeleton' (default) or 'stages'.
 */
function ThinkingPlaceholder({
  charName,
  startedAt,
  stage,
  mode = 'skeleton',
}: {
  charName?: string;
  startedAt: number;
  stage?: 'processing' | 'generating';
  mode?: 'skeleton' | 'stages';
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  if (mode === 'stages') {
    const reading = stage === 'processing' || stage === 'generating';
    const thinking = stage === 'generating';
    return (
      <div
        aria-label={`${charName ?? 'Assistant'} is thinking`}
        aria-live="polite"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0', fontSize: '0.85rem' }}
      >
        <StageRow done={reading} active={!reading} label="Reading context" />
        <StageRow
          done={thinking}
          active={reading && !thinking}
          label={`Thinking${reading && !thinking ? ` ${elapsed}s` : ''}`}
        />
        <StageRow done={false} active={thinking} label="Generating" />
      </div>
    );
  }

  return (
    <div
      aria-label={`${charName ?? 'Assistant'} is thinking`}
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent)',
                opacity: 0.6,
                animation: 'typingDot 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.18}s`,
                display: 'inline-block',
              }}
            />
          ))}
          <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
            Thinking… {elapsed}s
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonLine widthPct={92} />
        <SkeletonLine widthPct={78} />
        <SkeletonLine widthPct={64} />
      </div>
    </div>
  );
}

/** A single shimmering placeholder line for the thinking skeleton. */
function SkeletonLine({ widthPct }: { widthPct: number }) {
  return (
    <div
      className="loading-shimmer"
      style={{
        height: 10,
        width: `${widthPct}%`,
        borderRadius: 5,
        opacity: 0.55,
      }}
    />
  );
}

/** A single row in the stages-mode thinking placeholder. */
function StageRow({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  const color = done
    ? 'var(--color-success, var(--color-accent))'
    : active
      ? 'var(--color-accent)'
      : 'var(--color-text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, opacity: done || active ? 1 : 0.55 }}>
      <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
        {done ? '✓' : active ? '●' : '○'}
      </span>
      <span>{label}</span>
    </div>
  );
}

/**
 * Visual novel style message bubble.
 * User messages render as right-aligned accent-gradient bubbles.
 * Assistant messages render as left-aligned cards with avatar, name, and hover metadata.
 * Uses CSS animations from dialogue.css for entrance and components.css for typing dots.
 *
 * Feature #10: Adds a pin button that appears on hover. Clicking it calls
 * PUT /api/messages/{serverMessageId}/pin and tracks pinned state locally.
 * Pinned messages show a filled Pin indicator in the top-right corner.
 */
function TimeoutActionCard({ message }: { message: import('../lib/types').ChatMessage }) {
  const { retryLastTimeout, dismissTimeout } = useChatStore();
  const openSettingsTab = useAppStore(s => s.openSettingsTab);
  const retryText = message.retryText ?? '';

  const btnStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--color-border, rgba(128,128,128,0.3))',
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      borderRadius: 10,
      border: '1px solid var(--color-warning, #f59e0b)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      maxWidth: 340,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.85rem' }}>
        <Clock size={15} style={{ color: 'var(--color-warning, #f59e0b)', flexShrink: 0 }} />
        Response is taking too long
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        The model didn&apos;t respond in time. Check that your LLM is loaded, then try again.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {retryText && (
          <button style={{ ...btnStyle, background: 'var(--color-accent)', color: 'var(--color-on-accent, #fff)', borderColor: 'transparent' }}
            onClick={() => retryLastTimeout(retryText)}>
            Retry
          </button>
        )}
        <button style={btnStyle} onClick={() => openSettingsTab('LM Models')}>
          Switch model
        </button>
        <button style={btnStyle} onClick={() => {
          dismissTimeout();
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Countdown indicator shown when image regen has been in-flight for 30+ seconds. */
function StuckImageIndicator({ regenStartedAt, onRetry }: { regenStartedAt: number; onRetry?: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - regenStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [regenStartedAt]);

  if (elapsed < 30) return null;

  return (
    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginTop: 6 }}>
      {elapsed >= 60 ? (
        <span>
          Image took too long.{' '}
          {onRetry && (
            <button
              onClick={onRetry}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', fontStyle: 'normal', fontSize: 'inherit', textDecoration: 'underline' }}
            >
              Try again
            </button>
          )}
        </span>
      ) : 'Still generating image...'}
    </div>
  );
}

/** Retry card for status === 'failed' messages — mirrors TimeoutActionCard UX. */
function FailedActionCard({ message, onRetry }: { message: import('../lib/types').ChatMessage; onRetry?: () => void }) {
  const btnStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--color-border, rgba(128,128,128,0.3))',
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px',
      borderRadius: 10,
      border: '1px solid var(--color-danger, #f44336)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      maxWidth: 340,
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-danger, #f44336)' }}>
        Message failed to send
      </div>
      {message.text && (
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>
          {message.text.slice(0, 120)}{message.text.length > 120 ? '…' : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {onRetry && (
          <button style={{ ...btnStyle, background: 'var(--color-accent)', color: 'var(--color-on-accent, #fff)', borderColor: 'transparent' }}
            onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function DialogueBubble({ message, character, onPlayAudio, isPlaying, searchQuery = '', onChoiceSelect, onRegenerate, onRegenerateImage, onBranchSwitch, onDelete, onEdit, isLastAssistant = false, isRegenerating = false, onContinue, feedbackEnabled = false }: DialogueBubbleProps) {
  const thinkingMode = useAppStore(s => s.thinkingIndicatorMode);
  const [pinned, setPinned] = useState(message.pinned ?? false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedToMemory, setSavedToMemory] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | undefined>(message.voiceMessageUrl);
  const [editing, setEditing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // T0-3: Branch navigation state
  const [branchTotal, setBranchTotal] = useState(1);
  const [branchIndex, setBranchIndex] = useState(0);
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const branchFetched = useRef(false);

  // Eagerly fetch branch info on mount for assistant messages with serverMessageId
  const fetchBranches = useCallback(async () => {
    if (branchFetched.current || !message.serverMessageId || message.role !== 'assistant') return;
    branchFetched.current = true;
    try {
      const data = await api.getMessageBranches(message.serverMessageId);
      setBranchTotal(data.total);
      setBranchIndex(data.active_index);
      setBranchIds(data.branches.map(b => b.id));
    } catch { /* silent */ }
  }, [message.serverMessageId, message.role]);

  // Fetch branches eagerly on mount (not just on hover)
  useEffect(() => {
    if (message.role === 'assistant' && message.serverMessageId) {
      fetchBranches();
    }
  }, [message.serverMessageId, message.role, fetchBranches]);

  const handleBranchNav = useCallback(async (direction: -1 | 1) => {
    const newIdx = branchIndex + direction;
    if (newIdx < 0 || newIdx >= branchTotal || !branchIds[newIdx]) return;
    try {
      await api.activateBranch(branchIds[newIdx]);
      const data = await api.getMessageBranches(branchIds[newIdx]);
      const active = data.branches[data.active_index];
      setBranchIndex(data.active_index);
      if (active && onBranchSwitch) {
        onBranchSwitch(active.id, active.text, active.emotion, message.id);
      }
    } catch (err) {
      console.error('[BranchNav] switch failed:', err);
    }
  }, [branchIndex, branchTotal, branchIds, onBranchSwitch]);

  // Phase 15: Lazily load expression portraits for this character
  const charId = character?.id;
  const portraitsMode = character?.emotion_portraits_mode ?? 0;
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!charId || portraitsMode < 1 || fetchedRef.current) return;
    if (portraitCache[charId]) { fetchedRef.current = true; return; }
    fetchedRef.current = true;
    api.listExpressionPortraits(charId).then(res => {
      if (res.ok && res.portraits) portraitCache[charId] = res.portraits;
    }).catch(() => { /* silent — fall back to static avatar */ });
  }, [charId, portraitsMode]);

  /**
   * Feature #10: Toggle the pinned state of this message.
   * Calls PUT /api/messages/{serverMessageId}/pin optimistically — the local
   * state flips immediately and is only reverted if the server call fails.
   * No-op when serverMessageId is not available (e.g. pending messages).
   *
   * @param e - Mouse event (stopped from propagating to the bubble)
   */
  // @ts-expect-error — intentionally unused after Pin toggle button removal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message.serverMessageId) return;
    const next = !pinned;
    setPinned(next);
    try {
      await api.pinMessage(message.serverMessageId, next);
    } catch (err) {
      console.error('Pin failed:', err);
      setPinned(!next); // revert
    }
  };

  // Session-46: M2-item10 `handleSaveToMemory` no longer wired to a UI
  // button (Bookmark removed). Function kept for now in case we restore.
  /** M2-item10: Save message as a Permanent (T3) memory. */
  // @ts-expect-error — intentionally unused after Bookmark button removal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSaveToMemory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message.serverMessageId || savedToMemory) return;
    try {
      await api.pinMessageAsMemory(message.serverMessageId);
      setSavedToMemory(true);
      setTimeout(() => setSavedToMemory(false), 3000);
      if (character?.id) {
        api.grantAchievement(character.id, 'shared_secret').then((res) => {
          if (res.granted) {
            const { setPendingAchievement } = useAppStore.getState();
            setPendingAchievement(res.achievement);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[SaveToMemory] failed:', err);
    }
  };

  const handleGenerateVoice = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message.serverMessageId || generatingVoice) return;
    setGeneratingVoice(true);
    try {
      const res = await api.generateVoiceForMessage(message.serverMessageId);
      if (res.ok && res.url) setVoiceUrl(res.url);
    } catch (err) {
      console.error('[GenerateVoice] failed:', err);
    } finally {
      setGeneratingVoice(false);
    }
  };

  /** Copy message text to clipboard. */
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard not available */ }
  }, [message.text]);

  /** Enter edit mode — pre-fill textarea with current text. */
  const handleEditStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(message.text);
    setEditing(true);
    setTimeout(() => editRef.current?.focus(), 50);
  }, [message.text]);

  /** Confirm edit — call parent callback with new text. */
  const handleEditConfirm = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.text && onEdit) {
      onEdit(message.id, trimmed);
    }
    setEditing(false);
  }, [editText, message.text, message.id, onEdit]);

  /** Cancel edit — revert to original text. */
  const handleEditCancel = useCallback(() => {
    setEditText(message.text);
    setEditing(false);
  }, [message.text]);

  /** Delete message — call parent callback. */
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete(message.id);
  }, [message.id, onDelete]);

  // Director Mode messages: centered amber/gold cards with clapperboard icon
  if (message.role === 'director') {
    return (
      <div className="flex justify-center mb-3">
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-card)',
            padding: '8px 16px',
            maxWidth: '80%',
            fontSize: '0.8rem',
            color: 'rgb(245, 158, 11)',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          <span style={{ marginRight: 6 }}>🎬</span>
          {message.text}
        </div>
      </div>
    );
  }

  // Auto-compact system messages: render as centered inline divider
  if (message.role === 'system' && message.text.startsWith('\u27F3')) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '6px 16px',
        margin: '8px 0',
        fontSize: '0.7rem',
        color: 'var(--color-text-muted)',
        borderTop: '1px dashed var(--color-border)',
        borderBottom: '1px dashed var(--color-border)',
        opacity: 0.7,
      }}>
        {message.text}
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div
        className="flex justify-end mb-3"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="dialogue-bubble dialogue-you px-4 py-2.5 max-w-[75%] text-sm relative"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          {/* Pin indicator (always visible when pinned) */}
          {pinned && (
            <span
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
              title="Pinned"
            >
              <Pin size={9} />
            </span>
          )}
          {/* Session-46 cut: pin-toggle button removed (user feedback: buggy
              + clutter). Existing pinned indicator above still renders for
              already-pinned messages, just no way to add/remove from here. */}
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 200 }}>
              <textarea
                ref={editRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditConfirm(); } if (e.key === 'Escape') handleEditCancel(); }}
                style={{
                  width: '100%', minHeight: 60, resize: 'vertical',
                  fontSize: '0.875rem', padding: '6px 8px', borderRadius: 6,
                  border: '1px solid var(--color-accent)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={handleEditCancel} title="Cancel" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
                <button onClick={handleEditConfirm} title="Save" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)', color: 'var(--color-accent)', cursor: 'pointer' }}>
                  <Check size={12} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownText text={message.text} query={searchQuery} />
              {message.editedAt && (
                <span
                  title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    color: 'var(--color-text-tertiary)',
                    fontStyle: 'italic',
                    marginTop: '2px',
                    textAlign: 'right',
                  }}
                >
                  (edited)
                </span>
              )}
            </>
          )}
          {/* Action buttons — visible on hover; hidden while streaming */}
          {hovered && !editing && message.status === 'sent' && (
            <div
              className="absolute -bottom-3 right-2 flex items-center gap-0.5 px-1 py-0.5 rounded-md"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <button onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'} style={{ padding: 3, borderRadius: 3, border: 'none', background: 'transparent', color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
              {onEdit && (
                <button onClick={handleEditStart} title="Edit" style={{ padding: 3, borderRadius: 3, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <Pencil size={11} />
                </button>
              )}
              {onDelete && (
                <button onClick={handleDelete} title="Delete" style={{ padding: 3, borderRadius: 3, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="dialogue-bubble mb-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="dialogue-her p-4 relative"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        {/* Feature #10: Pinned indicator — shown when pinned and not hovering over the toggle button */}
        {pinned && !(hovered && message.serverMessageId != null) && (
          <span
            className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
            title="Pinned"
          >
            <Pin size={9} />
          </span>
        )}
        {/* Session-46 cut: second Pin toggle button removed (user feedback:
            buggy + clutter). See the parallel removal of the assistant-bubble
            Pin toggle and the "Remember this" Bookmark earlier in this file. */}
        {/* Phase 15: Resolve per-message emotion avatar (or static fallback) */}
        <div className="flex items-center gap-2 mb-2">
          {(() => {
            const staticUrl = resolveAvatarUrl(character?.name, character?.avatar_url);
            const src = portraitsMode >= 1
              ? resolveEmotionAvatarUrl(charId, message.emotion, staticUrl)
              : staticUrl;
            if (src) {
              return (
                <img
                  src={src}
                  alt={message.emotion || ''}
                  className="w-8 h-8 rounded-full object-cover"
                  style={{ transition: 'opacity 0.3s ease' }}
                />
              );
            }
            return null;
          })() ?? (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--color-accent-gradient)',
                color: 'var(--color-accent-text)',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              {character?.name?.[0] ?? '?'}
            </div>
          )}
          <span className="char-name-display" style={{ color: 'var(--color-accent)', fontSize: '0.9rem' }}>
            {character?.name || 'Assistant'}
          </span>
          {message.emotion && message.emotion !== 'neutral' && EMOTION_EMOJI[message.emotion] && (
            <span title={message.emotion} style={{ fontSize: '0.85rem', lineHeight: 1 }}>
              {EMOTION_EMOJI[message.emotion]}
            </span>
          )}
          {message.editedAt && (
            <span
              title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-tertiary)',
                fontStyle: 'italic',
                marginLeft: '0.4rem',
              }}
            >
              (edited)
            </span>
          )}
          {message.audioUrl && onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="ml-auto p-1.5 rounded-lg transition-all duration-200"
              style={{
                color: isPlaying ? 'var(--color-accent-text)' : 'var(--color-accent)',
                background: isPlaying ? 'var(--color-accent-gradient)' : 'transparent',
              }}
            >
              <Volume2 size={14} className={isPlaying ? 'animate-pulse' : ''} />
            </button>
          )}
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {message.status === 'pending' ? (
            <ThinkingPlaceholder
              charName={character?.name}
              startedAt={message.createdAt}
              stage={message.stage}
              mode={thinkingMode}
            />
          ) : message.status === 'streaming' ? (
            <span>
              <MarkdownText text={message.text} query={searchQuery} />
              <span
                style={{
                  display: 'inline-block',
                  width: 2,
                  height: '1em',
                  marginLeft: 2,
                  verticalAlign: 'text-bottom',
                  backgroundColor: 'var(--color-accent)',
                  animation: 'caretBlink 1s steps(2) infinite',
                }}
              />
            </span>
          ) : message.status === 'timeout' ? (
            <TimeoutActionCard message={message} />
          ) : message.status === 'failed' ? (
            <FailedActionCard
              message={message}
              onRetry={onRegenerate && message.serverMessageId != null ? () => onRegenerate(message.serverMessageId!) : undefined}
            />
          ) : editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 200 }}>
              <textarea
                ref={editRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditConfirm(); } if (e.key === 'Escape') handleEditCancel(); }}
                style={{
                  width: '100%', minHeight: 60, resize: 'vertical',
                  fontSize: '0.875rem', padding: '6px 8px', borderRadius: 6,
                  border: '1px solid var(--color-accent)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={handleEditCancel} title="Cancel" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
                <button onClick={handleEditConfirm} title="Save" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)', color: 'var(--color-accent)', cursor: 'pointer' }}>
                  <Check size={12} />
                </button>
              </div>
            </div>
          ) : (
            <MarkdownText text={message.text} query={searchQuery} />
          )}
        </div>

        {/* Generated image from agent's generate_image tool */}
        {message.imageUrl && (
          <div className="mt-2">
            <img
              src={message.imageUrl}
              alt="Generated image"
              className="rounded-lg max-w-full"
              onClick={() => setLightboxOpen(true)}
              style={{
                maxHeight: 360,
                border: '1px solid var(--color-border-subtle)',
                objectFit: 'contain',
                cursor: 'zoom-in',
              }}
            />
          </div>
        )}

        {/* Stuck-gen indicator — shown when image regen has been in-flight 30+ seconds */}
        {message.regenStartedAt != null && (
          <StuckImageIndicator
            regenStartedAt={message.regenStartedAt}
            onRetry={onRegenerateImage ? () => onRegenerateImage(message.id) : undefined}
          />
        )}
        <AnimatePresence>
          {lightboxOpen && message.imageUrl && (
            <ChatImageLightbox
              imageUrl={message.imageUrl}
              onClose={() => setLightboxOpen(false)}
              onSave={() => {
                const filename = `${character?.name ?? 'image'}-${message.id.slice(0, 8)}.png`;
                void downloadUrl(message.imageUrl!, filename);
              }}
              onRegenerate={
                message.imagePrompt && onRegenerateImage
                  ? () => onRegenerateImage(message.id)
                  : undefined
              }
            />
          )}
        </AnimatePresence>

        {/* M3-item16: Voice message inline audio player */}
        {voiceUrl && (
          <div style={{ marginTop: 6 }}>
            <audio
              controls
              src={voiceUrl}
              style={{ width: '100%', height: 28, borderRadius: 4 }}
            />
          </div>
        )}

        {/* Feature E: Dialogue choice buttons */}
        {message.choices && message.choices.length > 0 && onChoiceSelect && (
          <div className="mt-3 flex flex-col gap-1.5">
            {message.choices.map((choice, idx) => (
              <button
                key={idx}
                onClick={() => onChoiceSelect(choice)}
                className="text-left text-xs px-3 py-1.5 rounded-lg transition-all duration-150"
                style={{
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-accent-soft)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-surface)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
                }}
              >
                {choice}
              </button>
            ))}
          </div>
        )}

        <MessageMeta message={message} />

        {/* Branch nav strip — always visible when branches exist or this is the last assistant message */}
        {message.status === 'sent' && message.role === 'assistant' && (branchTotal > 1 || isLastAssistant) && (
          <div
            className="flex items-center gap-1.5 mt-2 pt-1.5"
            style={{ borderTop: '1px solid var(--color-border-subtle)', fontSize: '0.7rem' }}
          >
            {branchTotal > 1 && message.serverMessageId != null && (
              <>
                <button
                  onClick={() => handleBranchNav(-1)}
                  disabled={branchIndex <= 0}
                  className="p-0.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title="Previous version (Left arrow)"
                >
                  <ChevronLeft size={12} />
                </button>
                <span
                  style={{ color: 'var(--color-text-muted)', minWidth: 28, textAlign: 'center' }}
                  title={branchTotal > 10 ? `More versions exist (showing first 10)` : undefined}
                >
                  {branchIndex + 1}/{branchTotal > 10 ? '10+' : branchTotal}
                </span>
                <button
                  onClick={() => handleBranchNav(1)}
                  disabled={branchIndex >= branchTotal - 1}
                  className="p-0.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title="Next version (Right arrow)"
                >
                  <ChevronRight size={12} />
                </button>
              </>
            )}
            <div className="flex items-center gap-0.5 ml-auto">
              {onRegenerate && message.serverMessageId != null && (
                <button
                  onClick={() => onRegenerate(message.serverMessageId!)}
                  disabled={isRegenerating}
                  className="p-0.5 rounded transition-colors disabled:opacity-50"
                  style={{ color: isRegenerating ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                  title="Regenerate response (Ctrl+Shift+R)"
                >
                  <RefreshCw size={11} className={isRegenerating ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Secondary action bar — copy/delete on hover */}
        {hovered && message.status === 'sent' && (
          <div
            className="flex items-center gap-0.5 mt-1"
            style={{ fontSize: '0.7rem' }}
          >
            {onRegenerate && message.role === 'assistant' && message.serverMessageId != null && (
              <button
                onClick={() => onRegenerate(message.serverMessageId!)}
                disabled={isRegenerating}
                className="p-0.5 rounded transition-colors disabled:opacity-50"
                style={{ color: isRegenerating ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                title={isRegenerating ? 'Regenerating...' : 'Regenerate response'}
              >
                <RefreshCw size={11} className={isRegenerating ? 'animate-spin' : ''} />
              </button>
            )}
            {onEdit && !editing && (
              <button
                onClick={handleEditStart}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                title="Edit message"
              >
                <Pencil size={11} />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-0.5 rounded transition-colors"
              style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
              title={copied ? 'Copied!' : 'Copy text'}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
            {/* Session-46 cut: "Remember this" Bookmark button removed
                (user feedback: buggy). Memory is now driven entirely by the
                Kokoro `memoryWrite` field on assistant turns + the existing
                tiered_memory promotion path. Manual pinning was redundant. */}
            {message.serverMessageId != null && (
              <button
                onClick={handleGenerateVoice}
                disabled={generatingVoice}
                className="p-0.5 rounded transition-colors disabled:opacity-50"
                style={{ color: voiceUrl ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                title={generatingVoice ? 'Generating voice...' : voiceUrl ? 'Regenerate voice' : 'Generate voice'}
              >
                <Volume2 size={11} className={generatingVoice ? 'animate-pulse' : ''} />
              </button>
            )}
            {onContinue && isLastAssistant && message.role === 'assistant' && (
              <button
                onClick={onContinue}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                title="Continue response"
              >
                <ChevronsRight size={11} />
              </button>
            )}
            {feedbackEnabled && message.role === 'assistant' && message.serverMessageId != null && (
              <FeedbackButtons messageId={message.serverMessageId} />
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                title="Delete message"
              >
                <Trash2 size={11} />
              </button>
            )}
            {/* Per-message timestamp — shown on hover */}
            <span
              style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontSize: '0.68rem', userSelect: 'none' }}
              title={new Date(message.createdAt).toLocaleString()}
            >
              {formatRelativeTime(message.createdAt)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
