/**
 * GesturePicker — floating toolbar for triggering VRM character gestures
 * and facial expressions from within the chat composer area.
 *
 * Communicates with the embedded VRM viewer via postMessage (cross-frame IPC)
 * and also fires a backend confirmation via POST /api/viewer/gesture.
 */

import { useCallback } from 'react';
import { api } from '../lib/api';
import { useViewerStore } from '../stores/viewerStore';

// ── Types ──────────────────────────────────────────────────────────────────────

/** A named gesture action the VRM viewer understands. */
export type GestureName = 'wave' | 'dance' | 'think' | 'laugh' | 'bow' | 'jump';

/** A named facial expression the VRM viewer understands. */
export type ExpressionName = 'smile' | 'angry' | 'surprised' | 'blush' | 'wink' | 'sad';

export interface GesturePickerProps {
  /**
   * Called when the user triggers a gesture or expression.
   *
   * @param gesture - The gesture action name, or null if only an expression changed.
   * @param expression - The expression name, or null if only a gesture was triggered.
   */
  onGesture: (gesture: GestureName | null, expression: ExpressionName | null) => void;
  /** Class name forwarded to the outermost container for positioning. */
  className?: string;
}

// ── Gesture catalogue ──────────────────────────────────────────────────────────

interface GestureEntry {
  id: GestureName;
  emoji: string;
  label: string;
}

interface ExpressionEntry {
  id: ExpressionName;
  emoji: string;
  label: string;
}

const GESTURES: GestureEntry[] = [
  { id: 'wave',  emoji: '👋', label: 'Wave' },
  { id: 'dance', emoji: '💃', label: 'Dance' },
  { id: 'think', emoji: '🤔', label: 'Think' },
  { id: 'laugh', emoji: '😄', label: 'Laugh' },
  { id: 'bow',   emoji: '🙇', label: 'Bow' },
  { id: 'jump',  emoji: '⬆️', label: 'Jump' },
];

const EXPRESSIONS: ExpressionEntry[] = [
  { id: 'smile',     emoji: '😊', label: 'Smile' },
  { id: 'angry',     emoji: '😤', label: 'Angry' },
  { id: 'surprised', emoji: '😮', label: 'Surprised' },
  { id: 'blush',     emoji: '😳', label: 'Blush' },
  { id: 'wink',      emoji: '😉', label: 'Wink' },
  { id: 'sad',       emoji: '🥺', label: 'Sad' },
];

// ── VRM viewer postMessage helper ──────────────────────────────────────────────

/**
 * Find the embedded VRM viewer iframe and post a gesture/expression event to it.
 *
 * The viewer iframe is identified by its `title` attribute or by its `src`
 * pointing to the shared viewer HTML. Falls back gracefully when the viewer
 * is not present (e.g. when the model panel is collapsed).
 *
 * @param gesture - The gesture action name, or null.
 * @param expression - The expression name, or null.
 * @param intensity - Intensity from 0–1 (default 1.0).
 */
function postGestureToViewer(
  gesture: GestureName | null,
  expression: ExpressionName | null,
  intensity = 1.0,
): void {
  useViewerStore.getState().dispatchGesture(gesture, expression, intensity);
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Floating card with quick-trigger gesture and expression buttons.
 *
 * Renders above the chat composer row when visible. The parent component
 * controls visibility — this component is always mounted when shown.
 *
 * On each button press:
 *   1. Calls `onGesture` so the parent can track the action.
 *   2. Sends a postMessage to the VRM viewer iframe.
 *   3. POSTs to /api/viewer/gesture (fire-and-forget) for server-side logging.
 *
 * @param props - See GesturePickerProps.
 *
 * @example
 * <GesturePicker onGesture={(g, e) => console.log(g, e)} />
 */
export function GesturePicker({ onGesture, className = '' }: GesturePickerProps) {
  /**
   * Unified handler for both gesture and expression buttons.
   *
   * @param gesture - Gesture to trigger, or null for expression-only.
   * @param expression - Expression to apply, or null for gesture-only.
   */
  const handleTrigger = useCallback(
    (gesture: GestureName | null, expression: ExpressionName | null) => {
      // 1. Notify parent
      onGesture(gesture, expression);

      // 2. postMessage to VRM viewer iframe
      postGestureToViewer(gesture, expression, 1.0);

      // 3. Backend confirmation — fire-and-forget
      api.triggerGesture(gesture, expression, 1.0).catch(() => {
        // Non-critical; viewer already received the postMessage above
      });
    },
    [onGesture],
  );

  const btnBase: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '6px 8px',
    borderRadius: 'var(--radius-button)',
    border: '1px solid var(--color-border-subtle)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    minWidth: 48,
  };

  return (
    <div
      className={className}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 95%, transparent)',
        backdropFilter: 'var(--blur-surface)',
        WebkitBackdropFilter: 'var(--blur-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 12px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      role="toolbar"
      aria-label="Character gesture picker"
    >
      {/* Section label */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          margin: 0,
        }}
      >
        Gestures
      </p>

      {/* Gesture row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {GESTURES.map(({ id, emoji, label }) => (
          <button
            key={id}
            onClick={() => handleTrigger(id, null)}
            title={label}
            aria-label={`Trigger ${label} gesture`}
            style={btnBase}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'var(--color-accent-soft)';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'color-mix(in srgb, var(--color-accent) 40%, transparent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'var(--color-border-subtle)';
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', lineHeight: 1 }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--color-border-subtle)' }} />

      {/* Expression section label */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          margin: 0,
        }}
      >
        Expressions
      </p>

      {/* Expression row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {EXPRESSIONS.map(({ id, emoji, label }) => (
          <button
            key={id}
            onClick={() => handleTrigger(null, id)}
            title={label}
            aria-label={`Apply ${label} expression`}
            style={btnBase}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'var(--color-accent-soft)';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'color-mix(in srgb, var(--color-accent) 40%, transparent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'var(--color-border-subtle)';
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', lineHeight: 1 }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
