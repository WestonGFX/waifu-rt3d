/**
 * BoundaryPanel — Feature F40: Relationship Boundaries
 *
 * Slide-in panel for viewing and editing per-character comfort-level boundaries.
 * Two sections:
 *   1. Boundary form — radio/checkbox groups for each boundary type, each with
 *      a soft/hard enforcement level toggle.
 *   2. Generated constraint prompt preview — collapsible block showing the exact
 *      text that will be injected into the LLM system prompt.
 *
 * Usage:
 *   <BoundaryPanel isOpen={open} onClose={() => setOpen(false)} />
 *
 * API surface:
 *   GET    /api/characters/{id}/boundaries         — load all boundaries
 *   PUT    /api/characters/{id}/boundaries         — batch save
 *   DELETE /api/characters/{id}/boundaries/{type}  — remove one boundary type
 *   GET    /api/characters/{id}/boundaries/export  — download JSON
 *   POST   /api/characters/{id}/boundaries/import  — upload JSON
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, X, ChevronDown, ChevronRight, Save,
  Download, Upload, RotateCcw, Loader2, AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Constants & Types
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Defines each boundary category that the user can configure.
 * `isTextArea` means free-form text input instead of radio buttons.
 * `isCheckbox` means multi-select checkboxes instead of single-select radios.
 */
interface BoundaryTypeDef {
  type: string;
  label: string;
  description: string;
  options?: string[];
  isTextArea?: boolean;
  isCheckbox?: boolean;
}

const BOUNDARY_TYPES: BoundaryTypeDef[] = [
  {
    type: 'pacing',
    label: 'Pacing',
    description: 'How fast things progress',
    options: ['Natural', 'Slow-burn', 'Direct'],
  },
  {
    type: 'language_intensity',
    label: 'Language Intensity',
    description: 'How explicit the writing gets',
    options: ['Suggestive only', 'Moderate explicitness', 'Full explicitness'],
  },
  {
    type: 'physical_comfort',
    label: 'Physical Comfort',
    description: 'Physical contact comfort level',
    options: ['Hand-holding / hugging', 'Kissing / cuddling', 'Full physical intimacy'],
  },
  {
    type: 'scenario_types',
    label: 'Comfortable Scenarios',
    description: 'Types of scenarios you enjoy',
    options: ['Romantic dates', 'Emotional vulnerability', 'Light power play', 'Intense scenarios'],
    isCheckbox: true,
  },
  {
    type: 'topics_off_limits',
    label: 'Off-Limits Topics',
    description: 'Topics to always avoid — one per line',
    isTextArea: true,
  },
  {
    type: 'power_dynamics',
    label: 'Power Dynamics',
    description: 'Power play preferences',
    options: ['None', 'Light (teasing)', 'Moderate', 'Intense'],
  },
  {
    type: 'sensory_preferences',
    label: 'Sensory Focus',
    description: 'Preferred sensory emphasis',
    options: ['Visual', 'Auditory', 'Tactile', 'Temperature'],
    isCheckbox: true,
  },
];

/** Enforcement level — soft means gentle guidance, hard means strict rule. */
type BoundaryLevel = 'soft' | 'hard';

/**
 * The local form state for a single boundary type.
 * For radio types: `value` is the selected option string.
 * For checkbox types: `values` is the set of checked option strings.
 * For textarea types: `value` is the raw text.
 */
interface BoundaryEntry {
  type: string;
  value: string;
  values: string[];
  level: BoundaryLevel;
}

/** Shape returned by GET /api/characters/{id}/boundaries */
interface BoundaryApiRecord {
  type: string;
  value?: string;
  values?: string[];
  level?: BoundaryLevel;
}

interface BoundariesApiResponse {
  boundaries: BoundaryApiRecord[];
  constraint_prompt?: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

const BASE = 'http://localhost:8080';

/**
 * Builds the initial/blank form state for all boundary types.
 * All values default to empty; levels default to 'soft'.
 */
function buildDefaultState(): Record<string, BoundaryEntry> {
  const map: Record<string, BoundaryEntry> = {};
  for (const def of BOUNDARY_TYPES) {
    map[def.type] = { type: def.type, value: '', values: [], level: 'soft' };
  }
  return map;
}

/**
 * Merges API records over the blank defaults so every type is always present.
 *
 * @param records - Array of boundary records from the API
 * @returns Merged state keyed by boundary type
 */
function mergeApiRecords(records: BoundaryApiRecord[]): Record<string, BoundaryEntry> {
  const state = buildDefaultState();
  for (const rec of records) {
    if (rec.type in state) {
      state[rec.type] = {
        type: rec.type,
        value: rec.value ?? '',
        values: rec.values ?? [],
        level: rec.level ?? 'soft',
      };
    }
  }
  return state;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A pill-shaped toggle pair for Soft / Hard enforcement level.
 *
 * @param value    - Current level value
 * @param onChange - Callback when user selects a level
 */
function LevelToggle({
  value,
  onChange,
}: {
  value: BoundaryLevel;
  onChange: (v: BoundaryLevel) => void;
}) {
  const pillBase: React.CSSProperties = {
    fontSize: '0.62rem',
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 12,
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.13s',
    letterSpacing: '0.03em',
  };

  const active: React.CSSProperties = {
    backgroundColor: 'var(--color-accent)',
    color: '#fff',
    borderColor: 'var(--color-accent)',
  };

  const inactive: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    borderColor: 'var(--color-border)',
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        padding: '3px',
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 14,
      }}
    >
      {(['soft', 'hard'] as BoundaryLevel[]).map(lvl => (
        <button
          key={lvl}
          onClick={() => onChange(lvl)}
          style={{ ...pillBase, ...(value === lvl ? active : inactive) }}
          aria-pressed={value === lvl}
          aria-label={`Set enforcement to ${lvl}`}
        >
          {lvl === 'soft' ? 'Soft' : 'Hard'}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders a single boundary category row including its input (radio, checkbox,
 * or textarea) and the soft/hard level toggle.
 *
 * @param def      - The boundary type definition
 * @param entry    - The current form state for this boundary type
 * @param onChange - Callback with the updated entry
 */
function BoundaryRow({
  def,
  entry,
  onChange,
}: {
  def: BoundaryTypeDef;
  entry: BoundaryEntry;
  onChange: (updated: BoundaryEntry) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '0.75rem',
    padding: '8px 10px',
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 8,
    color: 'var(--color-text)',
    resize: 'vertical',
    minHeight: 72,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Category header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              lineHeight: 1.2,
            }}
          >
            {def.label}
          </p>
          <p
            style={{
              fontSize: '0.67rem',
              color: 'var(--color-text-secondary)',
              marginTop: 2,
            }}
          >
            {def.description}
          </p>
        </div>
        <LevelToggle
          value={entry.level}
          onChange={level => onChange({ ...entry, level })}
        />
      </div>

      {/* Free-text textarea */}
      {def.isTextArea && (
        <textarea
          value={entry.value}
          onChange={e => onChange({ ...entry, value: e.target.value })}
          placeholder="e.g. real-world violence, non-consensual scenarios..."
          style={inputStyle}
          aria-label={def.label}
        />
      )}

      {/* Checkbox multi-select */}
      {def.isCheckbox && def.options && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {def.options.map(opt => {
            const checked = entry.values.includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.72rem',
                  color: checked ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  backgroundColor: checked ? 'var(--color-accent-soft)' : 'transparent',
                  transition: 'all 0.13s',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? entry.values.filter(v => v !== opt)
                      : [...entry.values, opt];
                    onChange({ ...entry, values: next });
                  }}
                  style={{ display: 'none' }}
                  aria-label={opt}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {/* Radio single-select */}
      {!def.isTextArea && !def.isCheckbox && def.options && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {def.options.map(opt => {
            const selected = entry.value === opt;
            return (
              <label
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.72rem',
                  color: selected ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  backgroundColor: selected ? 'var(--color-accent-soft)' : 'transparent',
                  transition: 'all 0.13s',
                  userSelect: 'none',
                }}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => onChange({ ...entry, value: opt })}
                  style={{ display: 'none' }}
                  name={def.type}
                  aria-label={opt}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible preview of the constraint_prompt string the LLM will receive.
 * Starts collapsed to keep the panel focused on the form controls.
 *
 * @param prompt - The generated constraint prompt text (may be undefined when
 *                 boundaries have not yet been saved or when the server omits it)
 */
function ConstraintPreview({ prompt }: { prompt: string | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: 'var(--color-background)',
          border: 'none',
          cursor: 'pointer',
          gap: 8,
        }}
        aria-expanded={open}
        aria-controls="constraint-preview-body"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            Constraint Prompt Preview
          </span>
          <span
            style={{
              fontSize: '0.62rem',
              color: 'var(--color-text-secondary)',
              fontWeight: 400,
            }}
          >
            — what the LLM will see
          </span>
        </div>
        {open
          ? <ChevronDown size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        }
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="constraint-preview-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '10px 14px 14px',
                backgroundColor: 'var(--color-surface)',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              {prompt ? (
                <pre
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                    lineHeight: 1.6,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  {prompt}
                </pre>
              ) : (
                <p
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  No constraint prompt yet — save your boundaries to generate one.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * BoundaryPanel props.
 *
 * @param isOpen  - Whether the panel is visible
 * @param onClose - Callback to close the panel
 */
export interface BoundaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Slide-in panel for editing per-character relationship boundaries (F40).
 *
 * Opens from the right edge of the screen at 420px width.
 * Loads existing boundaries on mount and saves as a batch PUT.
 *
 * @example
 * // Controlled usage from a sidebar button:
 * const [open, setOpen] = useState(false);
 * <BoundaryPanel isOpen={open} onClose={() => setOpen(false)} />
 */
export function BoundaryPanel({ isOpen, onClose }: BoundaryPanelProps) {
  const { activeCharacter } = useAppStore();
  const charId = activeCharacter?.id ?? 0;
  const charName = activeCharacter?.name ?? 'Character';

  // ── Form state ──────────────────────────────────────────────────────
  const [entries, setEntries] = useState<Record<string, BoundaryEntry>>(buildDefaultState);
  const [constraintPrompt, setConstraintPrompt] = useState<string | undefined>(undefined);

  // ── Async state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Import file input ref ────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load boundaries when panel opens or character changes ────────────
  const loadBoundaries = useCallback(async (id: number) => {
    if (id === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/characters/${id}/boundaries`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: BoundariesApiResponse = await res.json();
      setEntries(mergeApiRecords(data.boundaries ?? []));
      setConstraintPrompt(data.constraint_prompt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && charId > 0) {
      loadBoundaries(charId);
    }
    if (!isOpen) {
      // Reset ephemeral UI state on close so it feels fresh next open
      setSaveSuccess(false);
      setError(null);
    }
  }, [isOpen, charId, loadBoundaries]);

  // ── Update a single boundary entry ──────────────────────────────────
  const handleChange = useCallback((updated: BoundaryEntry) => {
    setEntries(prev => ({ ...prev, [updated.type]: updated }));
  }, []);

  // ── Save all boundaries ──────────────────────────────────────────────
  /**
   * Sends the full form state to PUT /api/characters/{id}/boundaries.
   * On success, re-fetches boundaries so the constraint_prompt is current.
   */
  const handleSave = async () => {
    if (charId === 0) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const payload = { boundaries: Object.values(entries) };
      const res = await fetch(`${BASE}/api/characters/${charId}/boundaries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      // Re-fetch so constraint_prompt reflects the saved state
      await loadBoundaries(charId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to defaults ───────────────────────────────────────────────
  const handleReset = () => {
    setEntries(buildDefaultState());
    setConstraintPrompt(undefined);
    setError(null);
    setSaveSuccess(false);
  };

  // ── Export ───────────────────────────────────────────────────────────
  /**
   * Downloads the server-generated boundary export as a JSON file.
   * Falls back to exporting the current form state if the server endpoint
   * is unavailable.
   */
  const handleExport = async () => {
    if (charId === 0) return;
    try {
      const res = await fetch(`${BASE}/api/characters/${charId}/boundaries/export`);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${charName.toLowerCase().replace(/\s+/g, '_')}_boundaries.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Import ───────────────────────────────────────────────────────────
  /**
   * Reads the selected JSON file and posts it to the import endpoint.
   * On success, reloads boundaries to reflect the imported state.
   */
  const handleImport = async (file: File) => {
    if (charId === 0) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch(`${BASE}/api/characters/${charId}/boundaries/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      await loadBoundaries(charId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────
  const actionBtn = (variant: 'primary' | 'ghost' | 'danger'): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: '0.72rem',
      fontWeight: 500,
      padding: '7px 13px',
      borderRadius: 8,
      border: '1px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.13s',
      whiteSpace: 'nowrap',
    };
    if (variant === 'primary') {
      return {
        ...base,
        backgroundColor: saveSuccess ? 'var(--color-success, #39c96e)' : 'var(--color-accent)',
        color: '#fff',
        borderColor: saveSuccess ? 'var(--color-success, #39c96e)' : 'var(--color-accent)',
      };
    }
    if (variant === 'danger') {
      return {
        ...base,
        backgroundColor: 'transparent',
        color: 'var(--color-text-secondary)',
        borderColor: 'var(--color-border)',
      };
    }
    // ghost
    return {
      ...base,
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border)',
    };
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          // Reset so the same file can be re-selected
          e.target.value = '';
        }}
        aria-label="Import boundaries JSON file"
      />

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: '#000',
                zIndex: 200,
              }}
              aria-hidden="true"
            />

            {/* Panel */}
            <motion.div
              role="dialog"
              aria-label={`Relationship boundaries — ${charName}`}
              aria-modal="true"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                right: 0,
                top: 0,
                bottom: 0,
                width: 'min(420px, 94vw)',
                backgroundColor: 'var(--color-surface)',
                borderLeft: '1px solid var(--color-border-subtle)',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
                zIndex: 201,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* ── Header ─────────────────────────────────────── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  height: 48,
                  flexShrink: 0,
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={15} style={{ color: 'var(--color-accent)' }} />
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                    }}
                  >
                    Boundaries
                  </span>
                  {charName && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--color-text-secondary)',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      — {charName}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    padding: 6,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label="Close boundaries panel"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ── Subtitle strip ─────────────────────────────── */}
              <div
                style={{
                  padding: '8px 16px',
                  flexShrink: 0,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-secondary)',
                }}
              >
                <p
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  Define what kinds of content and scenarios you're comfortable with.
                  <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}> Soft</strong> adds
                  guidance; <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>Hard</strong> sets
                  strict rules.
                </p>
              </div>

              {/* ── Scrollable body ────────────────────────────── */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Loading state */}
                {loading && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '40px 0',
                      color: 'var(--color-text-tertiary)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Loader2
                      size={20}
                      style={{
                        color: 'var(--color-accent)',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    <span style={{ fontSize: '0.78rem' }}>Loading boundaries...</span>
                  </div>
                )}

                {/* No character selected */}
                {!loading && charId === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '40px 16px',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    <Shield size={28} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <p style={{ fontSize: '0.78rem' }}>Select a character to configure boundaries.</p>
                  </div>
                )}

                {/* Boundary form */}
                {!loading && charId > 0 && (
                  <>
                    {BOUNDARY_TYPES.map(def => (
                      <BoundaryRow
                        key={def.type}
                        def={def}
                        entry={entries[def.type]}
                        onChange={handleChange}
                      />
                    ))}

                    {/* Constraint preview (collapsible) */}
                    <ConstraintPreview prompt={constraintPrompt} />
                  </>
                )}
              </div>

              {/* ── Error banner ───────────────────────────────── */}
              {error && (
                <div
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    backgroundColor: 'color-mix(in srgb, #ef4444 10%, transparent)',
                    borderTop: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
                    color: '#ef4444',
                    fontSize: '0.72rem',
                  }}
                  role="alert"
                >
                  <AlertCircle size={13} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                    aria-label="Dismiss error"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* ── Footer actions ─────────────────────────────── */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  borderTop: '1px solid var(--color-border-subtle)',
                  flexWrap: 'wrap',
                }}
              >
                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={saving || charId === 0}
                  style={{
                    ...actionBtn('primary'),
                    opacity: saving || charId === 0 ? 0.6 : 1,
                  }}
                  aria-label="Save boundaries"
                >
                  {saving
                    ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Save size={12} />
                  }
                  {saving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save'}
                </button>

                {/* Reset */}
                <button
                  onClick={handleReset}
                  disabled={saving}
                  style={{ ...actionBtn('ghost'), opacity: saving ? 0.6 : 1 }}
                  aria-label="Reset boundaries to defaults"
                >
                  <RotateCcw size={12} />
                  Reset
                </button>

                <div style={{ flex: 1 }} />

                {/* Export */}
                <button
                  onClick={handleExport}
                  disabled={charId === 0}
                  style={{ ...actionBtn('ghost'), opacity: charId === 0 ? 0.5 : 1 }}
                  aria-label="Export boundaries as JSON"
                >
                  <Download size={12} />
                  Export
                </button>

                {/* Import */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={charId === 0}
                  style={{ ...actionBtn('ghost'), opacity: charId === 0 ? 0.5 : 1 }}
                  aria-label="Import boundaries from JSON file"
                >
                  <Upload size={12} />
                  Import
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spinner keyframe — injected once as a style tag */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
