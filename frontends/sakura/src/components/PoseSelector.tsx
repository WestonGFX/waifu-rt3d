/**
 * PoseSelector — compact button group for switching the character's room pose
 * in the VRM viewer.
 *
 * Renders four small square icon buttons in a horizontal row. The active pose
 * is highlighted with the theme's accent colour. Pose changes are dispatched
 * through viewerStore so the VRM iframe receives them via postMessage.
 *
 * The `dispatchSetPose` action does not yet exist on the store — calls are
 * guarded with optional-chaining (`?.`) so the component renders safely before
 * that method is wired up.
 */

import { useState } from 'react';
import { User, Monitor, BedDouble, Armchair } from 'lucide-react';
import { useViewerStore } from '../stores/viewerStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The four supported room poses the VRM viewer understands. */
export type PoseName = 'standing' | 'sitting_couch' | 'sitting_desk' | 'lying_bed';

export interface PoseSelectorProps {
  /** Optional class name forwarded to the outermost container for positioning. */
  className?: string;
}

// ── Pose catalogue ────────────────────────────────────────────────────────────

interface PoseEntry {
  id: PoseName;
  /** Human-readable label shown in the tooltip. */
  label: string;
  /** Lucide icon element. */
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const POSES: PoseEntry[] = [
  { id: 'standing',      label: 'Standing',      Icon: User     },
  { id: 'sitting_couch', label: 'Sitting (couch)', Icon: Armchair },
  { id: 'sitting_desk',  label: 'Sitting (desk)', Icon: Monitor  },
  { id: 'lying_bed',     label: 'Lying (bed)',    Icon: BedDouble },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Horizontal row of four icon buttons for selecting a character room pose.
 *
 * The active pose button is highlighted with the theme accent colour;
 * inactive buttons use a transparent/surface background. Each click dispatches
 * the new pose to viewerStore via `dispatchSetPose`, which is forwarded as a
 * postMessage to the VRM iframe.
 *
 * Pose state is tracked locally (defaults to `'standing'`). The component does
 * NOT subscribe to `lastCommand` because poses are set-and-forget — there is no
 * round-trip reply from the viewer to confirm.
 *
 * @param props - See PoseSelectorProps.
 *
 * @example
 * // Inside ChatThread composer area:
 * <PoseSelector className="pose-selector" />
 */
export function PoseSelector({ className = '' }: PoseSelectorProps) {
  const [activepose, setActivePose] = useState<PoseName>('standing');

  /**
   * Handle a pose button click.
   *
   * Updates local active-pose state and dispatches to the viewer store.
   * The store method is accessed via optional chaining so the component
   * is safe to render before `dispatchSetPose` exists on the store type.
   *
   * @param pose - The pose to activate.
   */
  function handleSelect(pose: PoseName): void {
    setActivePose(pose);

    // dispatchSetPose will be added to viewerStore in a follow-up — guard
    // with optional chaining until then so no runtime error is thrown.
    const store = useViewerStore.getState() as typeof useViewerStore extends {
      getState: () => infer S;
    }
      ? S & { dispatchSetPose?: (p: PoseName) => void }
      : never;
    store.dispatchSetPose?.(pose);
  }

  // ── Shared button style ──────────────────────────────────────────────────

  /** Base style shared by all pose buttons. */
  const btnBase: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-button, 8px)',
    border: '1px solid var(--color-border-subtle)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
    padding: 0,
    flexShrink: 0,
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 4,
        alignItems: 'center',
      }}
      role="toolbar"
      aria-label="Character pose selector"
    >
      {POSES.map(({ id, label, Icon }) => {
        const isActive = activepose === id;

        const btnStyle: React.CSSProperties = {
          ...btnBase,
          backgroundColor: isActive
            ? 'var(--color-accent-soft)'
            : 'var(--color-surface)',
          borderColor: isActive
            ? 'color-mix(in srgb, var(--color-accent) 50%, transparent)'
            : 'var(--color-border-subtle)',
          color: isActive
            ? 'var(--color-accent)'
            : 'var(--color-text-secondary)',
        };

        return (
          <button
            key={id}
            onClick={() => handleSelect(id)}
            title={label}
            aria-label={`Set pose: ${label}`}
            aria-pressed={isActive}
            style={btnStyle}
            onMouseEnter={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = 'var(--color-accent-soft)';
                el.style.borderColor =
                  'color-mix(in srgb, var(--color-accent) 30%, transparent)';
                el.style.color = 'var(--color-accent)';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = 'var(--color-surface)';
                el.style.borderColor = 'var(--color-border-subtle)';
                el.style.color = 'var(--color-text-secondary)';
              }
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span
              style={{
                fontSize: 8,
                lineHeight: 1,
                color: isActive
                  ? 'var(--color-accent)'
                  : 'var(--color-text-tertiary)',
                textAlign: 'center',
                // Truncate long labels like "Sitting (couch)" to keep buttons square
                maxWidth: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label.split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
