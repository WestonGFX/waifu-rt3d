/**
 * ChatModeToggles — Features F27 (Whisper Mode) & F36 (QuickFire Mode)
 *
 * Compact toolbar toggles for intimate chat modes:
 * - **Whisper Mode** (F27): Messages styled with soft, intimate formatting.
 *   When active, the character's voice becomes breathier and messages get
 *   a subtle warm tint. Bond-gated: 60+.
 * - **QuickFire Mode** (F36): Enables rapid-fire short exchanges — removes
 *   the need for long prose. Character responds in brief, intense bursts.
 *   Bond-gated: 40+.
 *
 * These toggles sit in the chat composer toolbar alongside WritingStylePicker,
 * VN mode toggle, gesture picker, and director mode.
 *
 * @module ChatModeToggles
 */

import { MessageCircle, Zap } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   WhisperModeToggle
   ═══════════════════════════════════════════════════════════════════════ */

interface WhisperModeToggleProps {
  /** Whether whisper mode is currently active. */
  active: boolean;
  /** Toggle callback. */
  onToggle: () => void;
  /** Whether the feature is available (bond level check). */
  enabled?: boolean;
}

/**
 * Compact toolbar button that toggles whisper mode on/off.
 * When active, shows a soft purple glow to indicate the intimate
 * communication style. Disabled state greys out the button.
 *
 * @param props - See {@link WhisperModeToggleProps}.
 *
 * @example
 * <WhisperModeToggle
 *   active={whisperMode}
 *   onToggle={() => setWhisperMode(!whisperMode)}
 *   enabled={bondLevel >= 60}
 * />
 */
export function WhisperModeToggle({
  active,
  onToggle,
  enabled = true,
}: WhisperModeToggleProps) {
  return (
    <button
      onClick={enabled ? onToggle : undefined}
      title={
        !enabled
          ? 'Whisper mode — requires bond level 60+'
          : active
            ? 'Exit whisper mode'
            : 'Whisper mode — soft, intimate messages'
      }
      aria-label="Toggle whisper mode"
      aria-pressed={active}
      className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 text-base leading-none"
      style={{
        backgroundColor: active ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
        color: !enabled
          ? 'var(--color-text-muted)'
          : active
            ? 'rgb(139, 92, 246)'
            : 'var(--color-text-tertiary)',
        boxShadow: active ? '0 0 8px rgba(139, 92, 246, 0.2)' : 'none',
        opacity: enabled ? 1 : 0.4,
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
      disabled={!enabled}
    >
      <MessageCircle size={16} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   QuickFireToggle
   ═══════════════════════════════════════════════════════════════════════ */

interface QuickFireToggleProps {
  /** Whether quickfire mode is currently active. */
  active: boolean;
  /** Toggle callback. */
  onToggle: () => void;
  /** Whether the feature is available (bond level check). */
  enabled?: boolean;
}

/**
 * Compact toolbar button that toggles quickfire/sexting mode on/off.
 * When active, shows a warm orange glow. The character switches to
 * short, intense bursts of text rather than long-form prose.
 *
 * @param props - See {@link QuickFireToggleProps}.
 *
 * @example
 * <QuickFireToggle
 *   active={quickFireMode}
 *   onToggle={() => setQuickFireMode(!quickFireMode)}
 *   enabled={bondLevel >= 40}
 * />
 */
export function QuickFireToggle({
  active,
  onToggle,
  enabled = true,
}: QuickFireToggleProps) {
  return (
    <button
      onClick={enabled ? onToggle : undefined}
      title={
        !enabled
          ? 'Quickfire mode — requires bond level 40+'
          : active
            ? 'Exit quickfire mode'
            : 'Quickfire mode — short, intense exchanges'
      }
      aria-label="Toggle quickfire mode"
      aria-pressed={active}
      className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 text-base leading-none"
      style={{
        backgroundColor: active ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
        color: !enabled
          ? 'var(--color-text-muted)'
          : active
            ? 'rgb(249, 115, 22)'
            : 'var(--color-text-tertiary)',
        boxShadow: active ? '0 0 8px rgba(249, 115, 22, 0.2)' : 'none',
        opacity: enabled ? 1 : 0.4,
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
      disabled={!enabled}
    >
      <Zap size={16} />
    </button>
  );
}
