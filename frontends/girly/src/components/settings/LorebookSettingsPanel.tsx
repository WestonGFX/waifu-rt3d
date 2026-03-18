/**
 * LorebookSettingsPanel — Settings tab for the Story Bible (Lorebook).
 *
 * Displays all lorebook entries for the active persona with search/filter
 * controls, a live token-budget indicator, and inline entry editing via
 * LorebookEntryEditor. Supports SillyTavern World Info JSON import/export.
 *
 * Architecture notes:
 *  - Entry list is loaded from IndexedDB via appDb on mount and when the
 *    active persona changes. Mutations are persisted immediately.
 *  - Global lorebook settings (scan depth, budget cap, recursive scanning)
 *    are stored in the appDb settings table under key 'lorebook_settings'.
 *  - Import/Export maps LorebookEntry to/from the SillyTavern World Info
 *    v2 JSON envelope so books can be shared between AnimeGirly and ST.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  Filter,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import {
  type LorebookEntry,
  type LorebookGlobalSettings,
  DEFAULT_LOREBOOK_ENTRY,
  DEFAULT_LOREBOOK_SETTINGS,
} from '@/types/lorebook.ts';
import {
  deleteLorebookEntry,
  getSetting,
  listLorebookEntriesForPersona,
  bulkPutLorebookEntries,
  putLorebookEntry,
  putSetting,
} from '@/services/appDb.ts';
import { estimateTokenCount } from '@/services/contextBudgetService.ts';
import {
  AppCard,
  AppField,
  AppMutedNote,
  Button,
  Input,
  Switch,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';
import LorebookEntryEditor from './LorebookEntryEditor.tsx';

// ── SillyTavern World Info interchange types ──────────────────────────────────

/**
 * SillyTavern World Info v2 entry shape (subset we care about for round-trip).
 * Full spec: https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js
 */
interface STWorldInfoEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  selectiveLogic?: number;
  priority?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  vectorized?: boolean;
  order?: number;
  group?: string;
  regex?: string | null;
  position?: number; // 0 = before char, 1 = after char, 4 = author's note
  depth?: number;
}

interface STWorldInfoBook {
  name?: string;
  entries: Record<string, STWorldInfoEntry>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a skeleton LorebookEntry with the required id and timestamps.
 * Callers must fill in name/content before persisting.
 */
function makeDraftEntry(personaId: string | null): LorebookEntry {
  const now = Date.now();
  return {
    ...DEFAULT_LOREBOOK_ENTRY,
    id: crypto.randomUUID(),
    personaId,
    name: '',
    content: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts a SillyTavern WI entry to an AnimeGirly LorebookEntry.
 *
 * @param stEntry - Source SillyTavern entry
 * @param personaId - Persona to bind the imported entries to
 * @param insertionOrder - Sequential counter used for stable ordering
 */
function fromSTEntry(
  stEntry: STWorldInfoEntry,
  personaId: string | null,
  insertionOrder: number,
): LorebookEntry {
  const now = Date.now();
  // ST position 4 is author's note; depth defaults to 3 per ST convention
  const isAuthorsNote = stEntry.position === 4;
  return {
    ...DEFAULT_LOREBOOK_ENTRY,
    id: crypto.randomUUID(),
    personaId,
    name: stEntry.comment || `Entry ${insertionOrder + 1}`,
    triggers: stEntry.key ?? [],
    secondaryTriggers: stEntry.keysecondary ?? [],
    content: stEntry.content ?? '',
    priority: stEntry.priority ?? 50,
    enabled: stEntry.enabled ?? true,
    constant: stEntry.constant ?? false,
    selective: stEntry.selective ?? false,
    caseSensitive: stEntry.caseSensitive ?? false,
    useRegex: Boolean(stEntry.regex),
    isAuthorsNote,
    authorsNoteDepth: isAuthorsNote ? (stEntry.depth ?? 3) : 3,
    category: stEntry.group ?? '',
    scanDepth: stEntry.scanDepth ?? 0,
    insertionOrder: stEntry.order ?? insertionOrder,
    tokenEstimate: estimateTokenCount(stEntry.content ?? ''),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts an AnimeGirly LorebookEntry back to SillyTavern WI format.
 * Used for export so users can load the book into SillyTavern.
 *
 * @param entry - Source LorebookEntry
 * @param uid - Sequential numeric id required by ST
 */
function toSTEntry(entry: LorebookEntry, uid: number): STWorldInfoEntry {
  return {
    uid,
    key: entry.triggers,
    keysecondary: entry.secondaryTriggers,
    comment: entry.name,
    content: entry.content,
    enabled: entry.enabled,
    constant: entry.constant,
    selective: entry.selective,
    caseSensitive: entry.caseSensitive,
    regex: entry.useRegex && entry.triggers[0] ? entry.triggers[0] : null,
    priority: entry.priority,
    scanDepth: entry.scanDepth,
    order: entry.insertionOrder,
    group: entry.category,
    position: entry.isAuthorsNote ? 4 : 0,
    depth: entry.authorsNoteDepth,
  };
}

// ── Entry list row ────────────────────────────────────────────────────────────

/**
 * A single row in the lorebook entry list.
 * Shows name, category badge, trigger count, token estimate, and enabled toggle.
 */
function EntryRow({
  entry,
  isEditing,
  onEdit,
  onToggleEnabled,
}: {
  entry: LorebookEntry;
  isEditing: boolean;
  onEdit: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-[18px] border px-3 py-2.5 transition-colors',
        isEditing
          ? 'border-teal-300 bg-teal-50/60'
          : 'border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] hover:bg-[color:var(--control-bg)]',
      ].join(' ')}
    >
      {/* Enabled toggle */}
      <Switch
        checked={entry.enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={`${entry.enabled ? 'Disable' : 'Enable'} "${entry.name}"`}
      />

      {/* Name + meta */}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit entry: ${entry.name}`}
        aria-pressed={isEditing}
      >
        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {entry.name || <span className="italic text-[color:var(--text-muted)]">Untitled</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {entry.category && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700">
              {entry.category}
            </span>
          )}
          {entry.constant && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              constant
            </span>
          )}
          {entry.isAuthorsNote && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              author&apos;s note
            </span>
          )}
          <span className="text-[10px] text-[color:var(--text-muted)]">
            {entry.triggers.length} trigger{entry.triggers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {/* Token estimate */}
      <div
        className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700"
        title={`~${entry.tokenEstimate} tokens`}
      >
        ~{entry.tokenEstimate}t
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

/**
 * Renders the full Story Bible (Lorebook) settings panel.
 * The panel is self-contained: it loads, displays, edits, and persists
 * lorebook entries for the currently active persona.
 */
export default function LorebookSettingsPanel() {
  const { activePersona } = useCompanion();
  const personaId = activePersona?.id ?? null;

  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [globalSettings, setGlobalSettings] = useState<LorebookGlobalSettings>(
    DEFAULT_LOREBOOK_SETTINGS,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    if (!personaId) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await listLorebookEntriesForPersona(personaId);
      // Ensure tokenEstimate is populated for any entries that lack it
      const normalised = loaded.map((e) =>
        e.tokenEstimate > 0 ? e : { ...e, tokenEstimate: estimateTokenCount(e.content) },
      );
      setEntries(normalised);
    } finally {
      setIsLoading(false);
    }
  }, [personaId]);

  const loadGlobalSettings = useCallback(async () => {
    const stored = await getSetting<LorebookGlobalSettings>('lorebook_settings');
    if (stored) setGlobalSettings(stored);
  }, []);

  useEffect(() => {
    void loadEntries();
    void loadGlobalSettings();
  }, [loadEntries, loadGlobalSettings]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (entry.category) seen.add(entry.category);
    }
    return Array.from(seen).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return entries.filter((entry) => {
      const matchesQuery =
        !q ||
        entry.name.toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        entry.triggers.some((t) => t.toLowerCase().includes(q));
      const matchesCategory = !categoryFilter || entry.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [entries, searchQuery, categoryFilter]);

  const totalTokens = useMemo(
    () => entries.reduce((sum, e) => sum + e.tokenEstimate, 0),
    [entries],
  );

  const budgetCapTokens = useMemo(() => {
    // Approximate: 15% of a 4096-token context by default
    return Math.round(4096 * (globalSettings.maxBudgetPercent / 100));
  }, [globalSettings.maxBudgetPercent]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const handleSaveEntry = useCallback(
    async (updated: LorebookEntry) => {
      await putLorebookEntry(updated);
      setEntries((prev) => {
        const exists = prev.some((e) => e.id === updated.id);
        return exists
          ? prev.map((e) => (e.id === updated.id ? updated : e))
          : [updated, ...prev];
      });
      setEditingId(null);
    },
    [],
  );

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    await deleteLorebookEntry(entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setEditingId(null);
  }, []);

  const handleToggleEnabled = useCallback(async (entry: LorebookEntry) => {
    const updated: LorebookEntry = {
      ...entry,
      enabled: !entry.enabled,
      updatedAt: Date.now(),
    };
    await putLorebookEntry(updated);
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  const handleNewEntry = useCallback(() => {
    const draft = makeDraftEntry(personaId);
    // Optimistically add to list so the editor appears
    setEntries((prev) => [draft, ...prev]);
    setEditingId(draft.id);
  }, [personaId]);

  // ── Global settings ─────────────────────────────────────────────────────────

  const updateGlobalSettings = useCallback(
    async (patch: Partial<LorebookGlobalSettings>) => {
      const next = { ...globalSettings, ...patch };
      setGlobalSettings(next);
      await putSetting('lorebook_settings', next);
    },
    [globalSettings],
  );

  // ── Import / Export ─────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const book: STWorldInfoBook = {
      name: activePersona?.name ? `${activePersona.name} — Story Bible` : 'Story Bible',
      entries: Object.fromEntries(
        entries.map((entry, index) => [String(index), toSTEntry(entry, index)]),
      ),
    };
    const blob = new Blob([JSON.stringify(book, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lorebook-${personaId ?? 'global'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [entries, personaId, activePersona?.name]);

  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const book = JSON.parse(text) as STWorldInfoBook;
        const rawEntries = Object.values(book.entries ?? {});

        const imported: LorebookEntry[] = rawEntries.map((stEntry, index) =>
          fromSTEntry(stEntry, personaId, index),
        );

        if (imported.length === 0) return;

        await bulkPutLorebookEntries(imported);
        setEntries((prev) => [...imported, ...prev]);
      } catch {
        // Silently ignore malformed files — a toast system would be wired later
      } finally {
        // Reset the input so re-importing the same file triggers onChange
        if (importInputRef.current) importInputRef.current.value = '';
      }
    },
    [personaId],
  );

  // ── Current editing entry ───────────────────────────────────────────────────

  const editingEntry = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <SettingsSectionHeader
        eyebrow="Story Bible"
        title="Lorebook"
        description="Keyword-triggered lore injected into the prompt when conversation matches. Think of it as world-building context the companion can draw on."
        aside={<BookOpen className="h-4 w-4 text-teal-500" />}
      />

      {/* Token budget summary */}
      <AppCard className="flex items-center justify-between gap-4 px-3.5 py-2.5">
        <div>
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            Total lorebook tokens
          </div>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Budget cap at {globalSettings.maxBudgetPercent}% of context window
            &nbsp;(~{budgetCapTokens} tokens)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className={[
              'rounded-full px-3 py-1 text-sm font-semibold',
              totalTokens > budgetCapTokens
                ? 'bg-rose-100 text-rose-700'
                : 'bg-teal-100 text-teal-700',
            ].join(' ')}
            aria-label={`${totalTokens} tokens total across all entries`}
          >
            {totalTokens.toLocaleString()} tokens
          </div>
          {totalTokens > budgetCapTokens && (
            <span className="text-[10px] text-rose-500">
              Over budget — lower-priority entries will be dropped
            </span>
          )}
        </div>
      </AppCard>

      {/* Toolbar: search + category filter + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries…"
            className="pl-8"
            aria-label="Search lorebook entries"
          />
        </div>

        {categories.length > 0 && (
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--text-muted)]" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-xl border border-[color:var(--control-border)] bg-[color:var(--control-bg)] pl-8 pr-3 text-sm text-[color:var(--text-primary)] shadow-[var(--control-shadow)] outline-none focus:ring-2 focus:ring-anime-300 focus:ring-offset-2 focus:ring-offset-[color:var(--control-ring-offset)]"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Import / Export */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => importInputRef.current?.click()}
          aria-label="Import World Info JSON"
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Import
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleImport(e)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={entries.length === 0}
          aria-label="Export Story Bible as World Info JSON"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>

        {/* New entry */}
        <Button
          type="button"
          size="sm"
          onClick={handleNewEntry}
          className="bg-teal-500 hover:bg-teal-600 focus-visible:ring-teal-300"
          aria-label="Create new lorebook entry"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New entry
        </Button>
      </div>

      {/* No-persona guard */}
      {!personaId && (
        <AppMutedNote>
          Select a persona to manage its Story Bible entries.
        </AppMutedNote>
      )}

      {/* Editor — rendered inline above the list when an entry is being edited */}
      {editingEntry && (
        <LorebookEntryEditor
          entry={editingEntry}
          onSave={(updated) => void handleSaveEntry(updated)}
          onCancel={() => {
            // If the entry has no content yet it was a new draft — remove it
            if (!editingEntry.name && !editingEntry.content) {
              setEntries((prev) => prev.filter((e) => e.id !== editingEntry.id));
            }
            setEditingId(null);
          }}
          onDelete={(id) => void handleDeleteEntry(id)}
        />
      )}

      {/* Entry list */}
      {!isLoading && personaId && (
        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Entries"
            title={`${filteredEntries.length} ${filteredEntries.length === 1 ? 'entry' : 'entries'}${searchQuery || categoryFilter ? ' (filtered)' : ''}`}
          />

          {filteredEntries.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {entries.length === 0
                ? 'No lore entries yet. Hit "New entry" to start building your world.'
                : 'No entries match your search or filter.'}
            </p>
          ) : (
            <div className="mt-2.5 space-y-1.5" role="list" aria-label="Lorebook entries">
              {filteredEntries.map((entry) => (
                <div key={entry.id} role="listitem">
                  <EntryRow
                    entry={entry}
                    isEditing={editingId === entry.id}
                    onEdit={() => setEditingId(editingId === entry.id ? null : entry.id)}
                    onToggleEnabled={() => void handleToggleEnabled(entry)}
                  />
                </div>
              ))}
            </div>
          )}
        </AppCard>
      )}

      {/* Global settings */}
      <SettingsSectionHeader
        eyebrow="Global"
        title="Scanner settings"
        description="These defaults apply across all entries that don't override them individually."
      />

      <AppCard className="p-3.5">
        <div className="space-y-3">
          {/* Max budget percent */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
                Max budget
              </span>
              <span className="text-xs font-mono text-[color:var(--text-muted)]">
                {globalSettings.maxBudgetPercent}%
              </span>
            </div>
            <p className="mb-1.5 text-xs leading-4.5 text-[color:var(--text-muted)]">
              Maximum percentage of the total context window that lorebook entries may use in aggregate.
            </p>
            <input
              type="range"
              min={5}
              max={40}
              value={globalSettings.maxBudgetPercent}
              onChange={(e) =>
                void updateGlobalSettings({ maxBudgetPercent: Number(e.target.value) })
              }
              className="h-2 w-full cursor-pointer accent-teal-500"
              aria-label="Max budget percent"
              aria-valuemin={5}
              aria-valuemax={40}
              aria-valuenow={globalSettings.maxBudgetPercent}
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-[color:var(--text-muted)]">
              <span>5%</span>
              <span>40%</span>
            </div>
          </div>

          {/* Default scan depth */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
                Default scan depth
              </span>
              <span className="text-xs font-mono text-[color:var(--text-muted)]">
                {globalSettings.defaultScanDepth}
              </span>
            </div>
            <p className="mb-1.5 text-xs leading-4.5 text-[color:var(--text-muted)]">
              Number of recent messages scanned for keyword matches when an entry's own depth is 0.
            </p>
            <input
              type="range"
              min={1}
              max={20}
              value={globalSettings.defaultScanDepth}
              onChange={(e) =>
                void updateGlobalSettings({ defaultScanDepth: Number(e.target.value) })
              }
              className="h-2 w-full cursor-pointer accent-teal-500"
              aria-label="Default scan depth"
              aria-valuemin={1}
              aria-valuemax={20}
              aria-valuenow={globalSettings.defaultScanDepth}
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-[color:var(--text-muted)]">
              <span>1</span>
              <span>20</span>
            </div>
          </div>

          {/* Toggle rows */}
          <div className={SETTINGS_PANEL_SUBCARD}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    Recursive scanning
                  </div>
                  <p className="mt-0.5 text-xs leading-4.5 text-[color:var(--text-muted)]">
                    Activated entries are themselves scanned for keywords that might chain-activate
                    additional entries.
                  </p>
                </div>
                <Switch
                  checked={globalSettings.recursiveScanning}
                  onCheckedChange={(checked) =>
                    void updateGlobalSettings({ recursiveScanning: checked })
                  }
                  aria-label="Enable recursive scanning"
                />
              </div>

              {globalSettings.recursiveScanning && (
                <AppField
                  label="Max recursive depth"
                  hint="Prevents infinite activation chains. Rarely needs to exceed 3."
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={globalSettings.maxRecursiveDepth}
                      onChange={(e) =>
                        void updateGlobalSettings({ maxRecursiveDepth: Number(e.target.value) })
                      }
                      className="h-2 flex-1 cursor-pointer accent-teal-500"
                      aria-label="Max recursive depth"
                      aria-valuemin={1}
                      aria-valuemax={6}
                      aria-valuenow={globalSettings.maxRecursiveDepth}
                    />
                    <span className="w-4 text-center text-sm font-mono text-[color:var(--text-muted)]">
                      {globalSettings.maxRecursiveDepth}
                    </span>
                  </div>
                </AppField>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    Activation indicator
                  </div>
                  <p className="mt-0.5 text-xs leading-4.5 text-[color:var(--text-muted)]">
                    Show a subtle in-chat hint listing which lorebook entries fired on the last turn.
                  </p>
                </div>
                <Switch
                  checked={globalSettings.showActivationIndicator}
                  onCheckedChange={(checked) =>
                    void updateGlobalSettings({ showActivationIndicator: checked })
                  }
                  aria-label="Show activation indicator"
                />
              </div>
            </div>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
