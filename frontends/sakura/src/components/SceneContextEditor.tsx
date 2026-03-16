/**
 * SceneContextEditor — Persistent scene/setting description for RP sessions.
 *
 * A collapsible panel that lets the user describe the current scene (location,
 * atmosphere, time of day, mood) and inject it into every LLM inference call.
 * The scene is silent — invisible in the chat transcript but present in the
 * system prompt as [Current Scene: ...].
 *
 * Designed to be embedded inside SessionDrawer, below AuthorNoteEditor.
 * Collapsed by default; power users expand with a single click.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  /** The session ID this scene belongs to. */
  sessionId: number | null;
}

/**
 * Collapsible scene context editor for a chat session.
 *
 * Fetches the current scene on mount (when sessionId is set) and persists
 * changes to the backend with a 600ms debounce. Shows a "SC" badge in the
 * header when enabled and non-empty.
 *
 * @example
 * <SceneContextEditor sessionId={sessionId} />
 */
export function SceneContextEditor({ sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load on session change ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    api.getScene(sessionId)
      .then(data => {
        setScene(data.scene ?? '');
        setEnabled(data.enabled ?? false);
      })
      .catch(() => {});
  }, [sessionId]);

  // ── Debounced save ───────────────────────────────────────────────────────

  /**
   * Schedule a debounced save. Cancelled if called again within 600ms,
   * preventing a server call on every keystroke.
   */
  const scheduleSave = useCallback((updates: { scene?: string; enabled?: boolean }) => {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateScene(sessionId, updates);
      } catch { /* non-critical */ } finally {
        setSaving(false);
      }
    }, 600);
  }, [sessionId]);

  const handleSceneChange = (v: string) => {
    setScene(v);
    scheduleSave({ scene: v, enabled });
  };

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    scheduleSave({ scene, enabled: v });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const hasScene = scene.trim().length > 0;

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
        <MapPin size={12} style={{ opacity: 0.7 }} />
        Scene / Setting
        {/* Active indicator */}
        {hasScene && enabled && (
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
            SC
          </span>
        )}
        {saving && (
          <span style={{ marginLeft: hasScene && enabled ? 4 : 'auto', fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
            saving…
          </span>
        )}
      </button>

      {/* Expandable body */}
      {open && (
        <div style={{ paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Enabled toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => handleToggle(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)', width: 13, height: 13 }}
            />
            Active
          </label>

          {/* Scene textarea */}
          <textarea
            value={scene}
            onChange={e => handleSceneChange(e.target.value)}
            placeholder="Describe the scene… e.g. 'Dae's apartment, evening, dim lighting, wine on the table, rain tapping against the window'"
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${hasScene && enabled ? 'color-mix(in srgb, var(--color-accent) 40%, var(--color-border))' : 'var(--color-border)'}`,
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
            Grounds the conversation in a specific place and mood. Injected as [Current Scene] in every inference call.
          </p>
        </div>
      )}
    </div>
  );
}
