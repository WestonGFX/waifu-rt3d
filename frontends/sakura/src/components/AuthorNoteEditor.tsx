/**
 * AuthorNoteEditor — Feature B4: Author's Note / Soft Prompt Injection
 *
 * A collapsible panel that lets the user inject a hidden "director's note"
 * into the LLM context at a configurable position.  The note is silent —
 * invisible to the character, invisible in the chat transcript, but present
 * in every inference call until the session is closed.
 *
 * Designed to be embedded inside SessionDrawer.  Collapsed by default so it
 * doesn't distract casual users; power users expand it with a single click.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Edit3 } from 'lucide-react';
import { api } from '../lib/api';

/** Valid injection position keys matching backend enum. */
type Position = 'before_system' | 'after_system' | 'before_last' | 'after_last2';

const POSITION_LABELS: Record<Position, string> = {
  before_system: 'Before system prompt',
  after_system:  'After system prompt',
  before_last:   'Before last message',
  after_last2:   'Before last 2 messages',
};

interface Props {
  /** The session ID this note belongs to. */
  sessionId: number | null;
}

/**
 * Collapsible author's note editor for a chat session.
 *
 * Fetches the current note on mount (when sessionId is set) and persists
 * changes to the backend with a 600ms debounce.  The note is highlighted
 * with an "AN" badge in the parent when enabled.
 *
 * @example
 * <AuthorNoteEditor sessionId={sessionId} />
 */
export function AuthorNoteEditor({ sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [position, setPosition] = useState<Position>('after_system');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load on session change ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    api.getAuthorNote(sessionId)
      .then(data => {
        setNote(data.note ?? '');
        setPosition((data.position as Position) ?? 'after_system');
        setEnabled(data.enabled ?? false);
      })
      .catch(() => {});
  }, [sessionId]);

  // ── Debounced save ───────────────────────────────────────────────────────

  /**
   * Schedule a debounced save.  Cancelled if called again within 600ms,
   * preventing a server call on every keystroke.
   */
  const scheduleSave = useCallback((updates: { note?: string; position?: string; enabled?: boolean }) => {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateAuthorNote(sessionId, updates);
      } catch { /* non-critical */ } finally {
        setSaving(false);
      }
    }, 600);
  }, [sessionId]);

  const handleNoteChange = (v: string) => {
    setNote(v);
    scheduleSave({ note: v, position, enabled });
  };

  const handlePositionChange = (v: Position) => {
    setPosition(v);
    scheduleSave({ note, position: v, enabled });
  };

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    scheduleSave({ note, position, enabled: v });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const hasNote = note.trim().length > 0;

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border)',
        marginTop: 4,
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '9px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Edit3 size={12} style={{ opacity: 0.7 }} />
        Author's Note
        {/* Active indicator */}
        {hasNote && enabled && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 4,
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
              color: 'var(--color-accent)',
              letterSpacing: '0.04em',
            }}
          >
            AN
          </span>
        )}
        {saving && (
          <span style={{ marginLeft: hasNote && enabled ? 4 : 'auto', fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
            saving…
          </span>
        )}
      </button>

      {/* Expandable body */}
      {open && (
        <div style={{ paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Enabled toggle + position selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => handleToggle(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)', width: 13, height: 13 }}
              />
              Active
            </label>
            <select
              value={position}
              onChange={e => handlePositionChange(e.target.value as Position)}
              style={{
                flex: 1,
                minWidth: 140,
                padding: '3px 6px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '0.75rem',
              }}
            >
              {(Object.entries(POSITION_LABELS) as [Position, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Note textarea */}
          <textarea
            value={note}
            onChange={e => handleNoteChange(e.target.value)}
            placeholder="[Write a scene note… e.g. 'It is late. Write in shorter, hushed sentences.']"
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${hasNote && enabled ? 'color-mix(in srgb, var(--color-accent) 40%, var(--color-border))' : 'var(--color-border)'}`,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              lineHeight: 1.55,
              boxSizing: 'border-box',
              outline: 'none',
              opacity: enabled ? 1 : 0.6,
              transition: 'border-color 0.15s, opacity 0.15s',
            }}
          />

          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            Injected silently into every inference call — invisible to the character and not shown in chat.
          </p>
        </div>
      )}
    </div>
  );
}
