import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Pin, ChevronLeft, ChevronRight, RefreshCw, Copy, Trash2, Pencil, Check, X } from 'lucide-react';
import type { ChatMessage, Character } from '../lib/types';
import { MessageMeta } from './MessageMeta';
import { api } from '../lib/api';
import { parseActions } from '../lib/parseActions';

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
  /** T0-3: called when user navigates to a different branch. */
  onBranchSwitch?: (newMessageId: number, newText: string, newEmotion?: string) => void;
  /** Called when the user deletes a message. Receives the local message ID. */
  onDelete?: (messageId: string) => void;
  /** Called when the user edits a message. Receives local ID and new text. */
  onEdit?: (messageId: string, newText: string) => void;
  /** Whether this is the last assistant message — shows always-visible regen button. */
  isLastAssistant?: boolean;
  /** Whether this message is currently being regenerated — shows spinner. */
  isRegenerating?: boolean;
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

/**
 * Renders message text with basic markdown: **bold**, *italic*-as-action,
 * (parenthetical narration), and paragraph breaks (double newline).
 * Single newlines become <br>. Search highlighting is preserved inside
 * plain segments. Italic tokens render with the theme accent color so
 * roleplay actions (`*i hold sakura's hand*`) stand out from spoken text.
 */
function MarkdownText({ text, query }: { text: string; query: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} style={{ margin: pi === 0 ? '0' : '0.55em 0 0' }}>
          {parseActions(para).map((tok, ti) => {
            const parts = tok.text.split('\n');
            const inner = parts.map((part, si) => (
              <span key={si}>
                {query.trim() ? <HighlightedText text={part} query={query} /> : part}
                {si < parts.length - 1 && <br />}
              </span>
            ));
            if (tok.type === 'bold') return <strong key={ti}>{inner}</strong>;
            if (tok.type === 'italic') return (
              <em key={ti} style={{ color: 'var(--color-action)', opacity: 0.95 }}>
                {inner}
              </em>
            );
            if (tok.type === 'narration') return (
              <span key={ti} style={{
                fontStyle: 'italic',
                color: 'var(--color-text-secondary)',
                opacity: 0.85,
                fontSize: '0.93em',
              }}>
                ({inner})
              </span>
            );
            return <span key={ti}>{inner}</span>;
          })}
        </p>
      ))}
    </>
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
export function DialogueBubble({ message, character, onPlayAudio, isPlaying, searchQuery = '', onChoiceSelect, onRegenerate, onBranchSwitch, onDelete, onEdit, isLastAssistant = false, isRegenerating = false }: DialogueBubbleProps) {
  const [pinned, setPinned] = useState(message.pinned ?? false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
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
        onBranchSwitch(active.id, active.text, active.emotion);
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
          {/* Pin toggle button (visible on hover when serverMessageId exists) */}
          {hovered && message.serverMessageId != null && (
            <button
              onClick={handleTogglePin}
              className="absolute -top-1.5 -left-1.5 flex items-center justify-center w-4 h-4 rounded-full transition-all"
              style={{
                backgroundColor: pinned ? 'var(--color-accent)' : 'var(--color-surface)',
                color: pinned ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
              }}
              title={pinned ? 'Unpin message' : 'Pin message'}
            >
              <Pin size={9} />
            </button>
          )}
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
            <MarkdownText text={message.text} query={searchQuery} />
          )}
          {/* Action buttons — visible on hover */}
          {hovered && !editing && (
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
        {/* Feature #10: Pin toggle button — visible on hover when serverMessageId is available */}
        {hovered && message.serverMessageId != null && (
          <button
            onClick={handleTogglePin}
            className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full transition-all"
            style={{
              backgroundColor: pinned ? 'var(--color-accent)' : 'var(--color-accent-soft)',
              color: pinned ? 'var(--color-accent-text)' : 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              opacity: pinned ? 1 : 0.8,
            }}
            title={pinned ? 'Unpin message' : 'Pin message'}
          >
            <Pin size={10} />
          </button>
        )}
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
            <div className="flex items-center gap-1 py-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : message.status === 'streaming' ? (
            <span>
              {message.text}
              <span className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-text-bottom"
                style={{ backgroundColor: 'var(--color-accent)' }} />
            </span>
          ) : message.status === 'failed' ? (
            <span style={{ color: 'var(--color-danger, #f44)', fontStyle: 'italic' }}>
              {message.text}
            </span>
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
              style={{
                maxHeight: 360,
                border: '1px solid var(--color-border-subtle)',
                objectFit: 'contain',
              }}
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
                <span style={{ color: 'var(--color-text-muted)', minWidth: 28, textAlign: 'center' }}>
                  {branchIndex + 1}/{branchTotal}
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
            <button
              onClick={handleCopy}
              className="p-0.5 rounded transition-colors"
              style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
              title={copied ? 'Copied!' : 'Copy text'}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
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
          </div>
        )}
      </div>
    </div>
  );
}
