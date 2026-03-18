/**
 * LorebookEntryEditor — Inline form for creating and editing a single lorebook entry.
 *
 * Renders inside LorebookSettingsPanel below the entry list. All field state is
 * local until the caller commits via onSave (which receives the full updated entry).
 * The Delete action calls onDelete with the entry id after a one-step inline
 * confirmation so the user can't accidentally wipe lore they didn't mean to.
 *
 * @example
 * <LorebookEntryEditor
 *   entry={draftEntry}
 *   onSave={(updated) => void persistAndClose(updated)}
 *   onCancel={() => setEditing(null)}
 *   onDelete={(id) => void deleteAndClose(id)}
 * />
 */

import { useEffect, useState } from 'react';
import { type LorebookEntry, DEFAULT_LOREBOOK_ENTRY } from '@/types/lorebook.ts';
import { estimateTokenCount } from '@/services/contextBudgetService.ts';
import {
  AppCard,
  AppField,
  Button,
  Input,
  Switch,
  Textarea,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';
import { BookOpen, Trash2 } from 'lucide-react';

/** Props accepted by LorebookEntryEditor. */
interface LorebookEntryEditorProps {
  /** Entry to edit. Pass a freshly-minted draft for creation. */
  entry: LorebookEntry;
  /** Called with the fully merged entry when the user confirms changes. */
  onSave: (entry: LorebookEntry) => void;
  /** Called when the user dismisses without saving. */
  onCancel: () => void;
  /**
   * Called with the entry id when the user confirms deletion.
   * Omit to hide the Delete button (useful for unsaved drafts).
   */
  onDelete?: (entryId: string) => void;
}

/**
 * Converts a comma-separated keyword string entered by the user into a
 * trimmed, de-duplicated array suitable for LorebookEntry.triggers.
 */
function parseTriggerInput(raw: string): string[] {
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Inverse of parseTriggerInput — joins an array back into a display string. */
function formatTriggerInput(triggers: string[]): string {
  return triggers.join(', ');
}

/**
 * Inline checkbox row with a label and optional description.
 * Uses a plain div + native checkbox so it stays outside AppField's <label>
 * wrapper and avoids double-activation on click.
 */
function CheckRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
      <div className="min-w-0 flex-1 pt-0.5">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-medium text-[color:var(--text-primary)]"
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs leading-4.5 text-[color:var(--text-muted)]">{description}</p>
        )}
      </div>
    </div>
  );
}

/** Small numeric slider row used for priority and scan depth. */
function SliderRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
          {label}
        </span>
        <span className="text-xs font-mono text-[color:var(--text-muted)]">{value}</span>
      </div>
      {description && (
        <p className="text-xs leading-4.5 text-[color:var(--text-muted)]">{description}</p>
      )}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-teal-500"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div className="flex justify-between text-[10px] text-[color:var(--text-muted)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function LorebookEntryEditor({
  entry,
  onSave,
  onCancel,
  onDelete,
}: LorebookEntryEditorProps) {
  // ── Local draft state ──────────────────────────────────────────────────────
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState(entry.category);
  const [triggersRaw, setTriggersRaw] = useState(formatTriggerInput(entry.triggers));
  const [secondaryTriggersRaw, setSecondaryTriggersRaw] = useState(
    formatTriggerInput(entry.secondaryTriggers),
  );
  const [content, setContent] = useState(entry.content);
  const [priority, setPriority] = useState(entry.priority);
  const [scanDepth, setScanDepth] = useState(entry.scanDepth);
  const [enabled, setEnabled] = useState(entry.enabled);
  const [constant, setConstant] = useState(entry.constant);
  const [isAuthorsNote, setIsAuthorsNote] = useState(entry.isAuthorsNote);
  const [authorsNoteDepth, setAuthorsNoteDepth] = useState(entry.authorsNoteDepth);
  const [caseSensitive, setCaseSensitive] = useState(entry.caseSensitive);
  const [useRegex, setUseRegex] = useState(entry.useRegex);
  const [selective, setSelective] = useState(entry.selective);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Live token estimate ────────────────────────────────────────────────────
  const tokenEstimate = estimateTokenCount(content);

  // Sync fields if the entry prop is swapped from outside (e.g. persona switch)
  useEffect(() => {
    setName(entry.name);
    setCategory(entry.category);
    setTriggersRaw(formatTriggerInput(entry.triggers));
    setSecondaryTriggersRaw(formatTriggerInput(entry.secondaryTriggers));
    setContent(entry.content);
    setPriority(entry.priority);
    setScanDepth(entry.scanDepth);
    setEnabled(entry.enabled);
    setConstant(entry.constant);
    setIsAuthorsNote(entry.isAuthorsNote);
    setAuthorsNoteDepth(entry.authorsNoteDepth);
    setCaseSensitive(entry.caseSensitive);
    setUseRegex(entry.useRegex);
    setSelective(entry.selective);
    setConfirmDelete(false);
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Commit ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const now = Date.now();
    const updated: LorebookEntry = {
      ...DEFAULT_LOREBOOK_ENTRY,
      ...entry,
      name: trimmedName,
      category: category.trim(),
      triggers: parseTriggerInput(triggersRaw),
      secondaryTriggers: parseTriggerInput(secondaryTriggersRaw),
      content: content.trim(),
      priority,
      scanDepth,
      enabled,
      constant,
      isAuthorsNote,
      authorsNoteDepth,
      caseSensitive,
      useRegex,
      selective,
      tokenEstimate,
      updatedAt: now,
      // createdAt is preserved from the existing entry; new entries set it before calling us
      createdAt: entry.createdAt || now,
    };

    onSave(updated);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppCard className="p-3.5">
      <SettingsSectionHeader
        eyebrow="Story Bible"
        title={entry.name || 'New entry'}
        description="Configure when and how this lore fires into the prompt."
        aside={<BookOpen className="h-4 w-4 text-teal-500" />}
      />

      <div className="mt-3 space-y-3">
        {/* ── Identity ────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <AppField label="Entry name" hint="Human-readable label shown in the lorebook list.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sakura Academy"
              aria-label="Entry name"
            />
          </AppField>
          <AppField label="Category" hint="Free-text grouping tag (characters, locations, lore, …).">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. locations"
              aria-label="Category"
            />
          </AppField>
        </div>

        {/* ── Triggers ────────────────────────────────────────────────────── */}
        <AppField
          label="Primary triggers"
          hint="Comma-separated keywords. Any one match activates this entry (unless selective mode is on)."
        >
          <Input
            value={triggersRaw}
            onChange={(e) => setTriggersRaw(e.target.value)}
            placeholder="sakura academy, the school, academy"
            aria-label="Primary triggers"
          />
        </AppField>

        <AppField
          label="Secondary triggers"
          hint="Only used in selective mode — at least one must also match alongside a primary keyword."
        >
          <Input
            value={secondaryTriggersRaw}
            onChange={(e) => setSecondaryTriggersRaw(e.target.value)}
            placeholder="uniform, campus, headmistress"
            aria-label="Secondary triggers"
          />
        </AppField>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
              Lore content
            </span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                tokenEstimate > 500
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-teal-100 text-teal-700',
              ].join(' ')}
              aria-live="polite"
              aria-label={`Estimated token count: ${tokenEstimate}`}
            >
              ~{tokenEstimate} tokens
            </span>
          </div>
          <Textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="A prestigious all-girls high school in northern Tokyo…"
            aria-label="Lore content"
          />
        </div>

        {/* ── Priority and scan depth ──────────────────────────────────────── */}
        <div className={SETTINGS_PANEL_SUBCARD}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SliderRow
              label="Priority"
              description="Higher-priority entries inject before lower ones when multiple fire simultaneously."
              value={priority}
              min={0}
              max={100}
              onChange={setPriority}
            />
            <SliderRow
              label="Scan depth"
              description="Messages to scan for keywords. 0 uses the global default scan depth."
              value={scanDepth}
              min={0}
              max={20}
              onChange={setScanDepth}
            />
          </div>
        </div>

        {/* ── Flags ───────────────────────────────────────────────────────── */}
        <div className={SETTINGS_PANEL_SUBCARD}>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Activation flags
          </p>
          <div className="space-y-3">
            <CheckRow
              id="lorebook-enabled"
              label="Enabled"
              description="Disabled entries are completely skipped during scanning."
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <CheckRow
              id="lorebook-constant"
              label="Always inject (constant)"
              description="Bypasses trigger scanning and injects on every turn. Good for permanent world rules."
              checked={constant}
              onCheckedChange={setConstant}
            />
            <CheckRow
              id="lorebook-selective"
              label="Selective mode"
              description="Requires both a primary AND a secondary keyword to match before activating."
              checked={selective}
              onCheckedChange={setSelective}
            />
            <CheckRow
              id="lorebook-case"
              label="Case-sensitive matching"
              description="When on, triggers match only with the exact capitalisation you typed."
              checked={caseSensitive}
              onCheckedChange={setCaseSensitive}
            />
            <CheckRow
              id="lorebook-regex"
              label="Use regex"
              description="Interpret triggers as regular expressions instead of plain substring matches."
              checked={useRegex}
              onCheckedChange={setUseRegex}
            />
            <CheckRow
              id="lorebook-authors-note"
              label="Author's note"
              description="Spliced into message history at a fixed depth rather than prepended to the system prompt."
              checked={isAuthorsNote}
              onCheckedChange={setIsAuthorsNote}
            />
          </div>

          {/* Authors note depth slider — only shown when isAuthorsNote is on */}
          {isAuthorsNote && (
            <div className="mt-3 border-t border-[color:var(--control-border-soft)] pt-3">
              <SliderRow
                label="Author's note depth"
                description="Number of messages from the end of history at which the note is spliced."
                value={authorsNoteDepth}
                min={1}
                max={10}
                onChange={setAuthorsNoteDepth}
              />
            </div>
          )}
        </div>

        {/* ── Action row ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Delete / confirm-delete */}
          <div className="flex items-center gap-2">
            {onDelete && !confirmDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete this entry"
                className="text-[color:var(--text-muted)] hover:text-rose-500"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            {onDelete && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-500">Delete permanently?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(entry.id)}
                >
                  Yes, delete
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!name.trim()}
              className="bg-teal-500 hover:bg-teal-600 focus-visible:ring-teal-300"
            >
              Save entry
            </Button>
          </div>
        </div>
      </div>
    </AppCard>
  );
}
