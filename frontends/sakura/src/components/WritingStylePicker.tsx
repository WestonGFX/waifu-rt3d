/**
 * WritingStylePicker — Feature F13: Writing Style Presets
 *
 * Compact chip/dropdown that lets users choose the prose style applied to
 * intimate and narrative scenes. Four built-in presets plus a "Character
 * Default" option that defers to the character's own voice settings.
 *
 * The collapsed state renders a small pill button showing the active style.
 * Clicking it expands an inline dropdown with each option's name, description,
 * and a representative sample line. Clicking outside collapses it.
 *
 * On selection the component:
 *   1. Calls PUT /api/sessions/{sessionId}/writing-style with { style }
 *   2. Invokes the onStyleChange callback so the parent can update local state
 *
 * @module WritingStylePicker
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Pen } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

/** One of the four named writing style presets. */
export type WritingStyleName = 'romantic' | 'literary' | 'direct' | 'suggestive';

/** Full descriptor for a writing style preset. */
interface StyleEntry {
  /** Machine-readable identifier sent to the API. */
  name: WritingStyleName;
  /** Display label shown in the UI. */
  displayName: string;
  /** One-sentence description of the prose register. */
  description: string;
  /** Short illustrative sample line, shown in italic. */
  sample: string;
  /** Emoji used as a compact visual identifier. */
  icon: string;
}

export interface WritingStylePickerProps {
  /** Active session ID — used to construct the PUT endpoint URL. */
  sessionId: number;
  /**
   * Currently active style name, or null when the character default is in
   * effect. Controlled externally; the component does not own this state.
   */
  currentStyle: WritingStyleName | null;
  /**
   * Called after a successful API response with the new style name, or null
   * when the user selects "Character Default".
   */
  onStyleChange?: (style: WritingStyleName | null) => void;
}

// ── Style catalogue ────────────────────────────────────────────────────────────

const WRITING_STYLES: StyleEntry[] = [
  {
    name: 'romantic',
    displayName: 'Romantic',
    description: 'Tender, emotional, poetic. Focuses on feelings and connection.',
    sample: 'Every touch was a conversation.',
    icon: '💗',
  },
  {
    name: 'literary',
    displayName: 'Literary',
    description: 'Artful prose with metaphor and symbol. Reads like published fiction.',
    sample: "She was a storm he'd stopped running from.",
    icon: '📖',
  },
  {
    name: 'direct',
    displayName: 'Direct',
    description: 'Explicit, straightforward, no euphemisms. Clear descriptions.',
    sample: 'She pulled him closer and kissed him hard.',
    icon: '🔥',
  },
  {
    name: 'suggestive',
    displayName: 'Suggestive',
    description: 'Implies more than it shows. Lets imagination fill the gaps.',
    sample: 'The rest of the night was theirs alone.',
    icon: '✨',
  },
];

// ── API helper ─────────────────────────────────────────────────────────────────

/**
 * Persist the writing style choice for the given session.
 *
 * @param sessionId - Active session ID.
 * @param style - The style to apply, or null to revert to character default.
 * @throws Error if the API request fails (non-2xx).
 *
 * @example
 * await setWritingStyle(12, 'romantic');
 * await setWritingStyle(12, null); // revert to character default
 */
async function setWritingStyle(
  sessionId: number,
  style: WritingStyleName | null,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/writing-style`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  });
  if (!res.ok) {
    throw new Error(`PUT writing-style: ${res.status}`);
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Chip-style picker for writing style presets.
 *
 * Collapsed: a single small button showing the active style name (or "Default")
 * with a chevron. Expanded: a floating dropdown listing all four presets plus
 * the character-default option. Selection persists immediately via the API.
 *
 * @param props - See WritingStylePickerProps.
 *
 * @example
 * <WritingStylePicker
 *   sessionId={session.id}
 *   currentStyle={writingStyle}
 *   onStyleChange={setWritingStyle}
 * />
 */
export function WritingStylePicker({
  sessionId,
  currentStyle,
  onStyleChange,
}: WritingStylePickerProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    /**
     * Collapse the dropdown when the user clicks anywhere outside the
     * component boundary.
     */
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  /**
   * Handle selection of a style (or null for character default).
   * Fires the API call and propagates the result via callback.
   *
   * @param style - The chosen style, or null for character default.
   */
  const handleSelect = useCallback(
    async (style: WritingStyleName | null) => {
      if (style === currentStyle) {
        setOpen(false);
        return;
      }
      setSaving(true);
      try {
        await setWritingStyle(sessionId, style);
        onStyleChange?.(style);
        setOpen(false);
      } catch (err) {
        // Non-fatal: keep dropdown open so user can retry
        console.error('[WritingStylePicker] Failed to save style:', err);
      } finally {
        setSaving(false);
      }
    },
    [currentStyle, sessionId, onStyleChange],
  );

  // Label shown in the collapsed chip
  const activeEntry = WRITING_STYLES.find((s) => s.name === currentStyle);
  const chipLabel = activeEntry ? activeEntry.displayName : 'Default';
  const chipIcon = activeEntry ? activeEntry.icon : null;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {/* ── Collapsed trigger chip ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Writing style: ${chipLabel}. Click to change.`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          backgroundColor: open
            ? 'var(--color-accent-soft)'
            : 'var(--color-surface)',
          color: open ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          fontSize: 12,
          fontWeight: 500,
          cursor: saving ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--color-accent)';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--color-accent)';
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--color-border)';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--color-text-secondary)';
          }
        }}
      >
        <Pen size={12} aria-hidden="true" />
        {chipIcon && (
          <span style={{ fontSize: 12, lineHeight: 1 }} aria-hidden="true">
            {chipIcon}
          </span>
        )}
        <span>{chipLabel}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* ── Expanded dropdown ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Writing style options"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              zIndex: 250,
              minWidth: 280,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
          >
            {/* Style options */}
            {WRITING_STYLES.map((entry, idx) => {
              const isActive = currentStyle === entry.name;
              return (
                <StyleOption
                  key={entry.name}
                  entry={entry}
                  isActive={isActive}
                  isFirst={idx === 0}
                  onSelect={handleSelect}
                />
              );
            })}

            {/* Divider */}
            <div
              style={{
                height: 1,
                margin: '0 10px',
                backgroundColor: 'var(--color-border-subtle)',
              }}
              aria-hidden="true"
            />

            {/* Character Default option */}
            <DefaultOption
              isActive={currentStyle === null}
              onSelect={handleSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface StyleOptionProps {
  entry: StyleEntry;
  isActive: boolean;
  isFirst: boolean;
  onSelect: (style: WritingStyleName | null) => void;
}

/**
 * A single row in the dropdown representing one writing style preset.
 *
 * Renders the icon, name, description, and sample line. The active option
 * gets an accent-colored left border and slightly highlighted background.
 *
 * @param props - See StyleOptionProps.
 */
function StyleOption({ entry, isActive, isFirst, onSelect }: StyleOptionProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(entry.name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px 10px 14px',
        border: 'none',
        borderTop: isFirst ? 'none' : '1px solid var(--color-border-subtle)',
        borderLeft: isActive
          ? '3px solid var(--color-accent)'
          : '3px solid transparent',
        backgroundColor: hovered
          ? 'var(--color-accent-soft)'
          : isActive
            ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
            : 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.12s',
      }}
    >
      {/* Name row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden="true">
          {entry.icon}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
          }}
        >
          {entry.displayName}
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          margin: '0 0 4px 20px',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
        }}
      >
        {entry.description}
      </p>

      {/* Sample line */}
      <p
        style={{
          margin: '0 0 0 20px',
          fontSize: 11,
          fontStyle: 'italic',
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.4,
        }}
      >
        &ldquo;{entry.sample}&rdquo;
      </p>
    </button>
  );
}

interface DefaultOptionProps {
  isActive: boolean;
  onSelect: (style: WritingStyleName | null) => void;
}

/**
 * The "Character Default" row at the bottom of the dropdown.
 *
 * Selecting this clears the override and lets the character's own writing
 * preference take effect.
 *
 * @param props - See DefaultOptionProps.
 */
function DefaultOption({ isActive, onSelect }: DefaultOptionProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(null)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px 10px 14px',
        border: 'none',
        borderLeft: isActive
          ? '3px solid var(--color-accent)'
          : '3px solid transparent',
        backgroundColor: hovered
          ? 'var(--color-accent-soft)'
          : isActive
            ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
            : 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.12s',
      }}
    >
      {/* Name row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
          }}
        >
          Character Default
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          margin: '0 0 0 0',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
        }}
      >
        Use the character&apos;s preferred writing style.
      </p>
    </button>
  );
}
