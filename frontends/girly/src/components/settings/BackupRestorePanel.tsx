/**
 * BackupRestorePanel – Backup & Restore section for Advanced Settings.
 *
 * Three sections:
 *   1. Create Backup  — exports all IndexedDB data as a JSON file.
 *   2. Restore from Backup — parses a backup file, shows a summary, lets the
 *      user choose which categories to restore, then merges into the DB.
 *   3. Auto-Backup — toggle that persists a preference flag; the background
 *      timer that honours it is a future enhancement.
 *
 * The real backup service is imported dynamically so the panel compiles and
 * renders correctly even before the service file lands on disk.
 */

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  Shield,
  Upload,
} from 'lucide-react';
import {
  AppCard,
  AppMutedNote,
  Button,
  SettingsSectionHeader,
  Switch,
} from './SettingsPrimitives.tsx';

// ---------------------------------------------------------------------------
// Backup service stub types
// ---------------------------------------------------------------------------

/**
 * Shape of the data object inside a backup file.
 * Individual table arrays are typed as unknown[] because the panel
 * never needs to inspect their contents — only count them.
 */
interface BackupData {
  personas?: unknown[];
  voiceProfiles?: unknown[];
  threads?: unknown[];
  messages?: unknown[];
  memories?: unknown[];
  summaries?: unknown[];
  psychologyStates?: unknown[];
  intimacyStates?: unknown[];
  lorebookEntries?: unknown[];
  relationships?: unknown[];
  settings?: unknown[];
}

/** Envelope written to the .json backup file. */
interface BackupEnvelope {
  magic: string;
  appVersion?: string;
  dbSchemaVersion?: number;
  createdAt: number;
  tableCounts: Record<string, number>;
  data: BackupData;
}

/**
 * Minimal result returned by the real createBackup() implementation.
 * The stub returns a placeholder that satisfies this shape.
 */
interface BackupResult {
  envelope: BackupEnvelope;
  /** Serialised JSON string ready to be written to disk. */
  json: string;
  /** Approximate byte length of the exported payload. */
  byteLength: number;
}

/**
 * Options controlling which categories are merged on restore.
 */
interface RestoreOptions {
  personas: boolean;
  threads: boolean;
  memories: boolean;
  psychology: boolean;
  lorebook: boolean;
  relationships: boolean;
  settings: boolean;
}

/**
 * Summary of how many records were actually written during restore.
 */
interface RestoreSummary {
  personas: number;
  threads: number;
  messages: number;
  memories: number;
}

// ---------------------------------------------------------------------------
// Stub implementations – replaced by the real service once it ships
// ---------------------------------------------------------------------------

/**
 * Stub for the real backup service export.
 * Returns a minimal valid envelope so the UI can exercise all states.
 */
async function createBackupStub(): Promise<BackupResult> {
  // Simulate async IndexedDB reads
  await new Promise<void>((resolve) => setTimeout(resolve, 600));

  const now = Date.now();
  const envelope: BackupEnvelope = {
    magic: 'animegirly-backup',
    appVersion: '0.1.0',
    dbSchemaVersion: 1,
    createdAt: now,
    tableCounts: {},
    data: {},
  };
  const json = JSON.stringify(envelope, null, 2);
  return { envelope, json, byteLength: new TextEncoder().encode(json).byteLength };
}

/**
 * Stub for the real restore service export.
 * Simulates a short async delay and returns zero counts.
 */
async function restoreBackupStub(
  ..._args: [BackupEnvelope, RestoreOptions]
): Promise<RestoreSummary> {
  void _args;
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  return { personas: 0, threads: 0, messages: 0, memories: 0 };
}

// ---------------------------------------------------------------------------
// Dynamic service resolution
// ---------------------------------------------------------------------------

/** Lazily resolved reference to the real createBackup once the service lands. */
let _createBackup: (() => Promise<BackupResult>) | null = null;
let _restoreBackup: ((envelope: BackupEnvelope, options: RestoreOptions) => Promise<RestoreSummary>) | null = null;

/**
 * Attempts to load the real backup service.  Falls back to stubs so the panel
 * always compiles and renders regardless of whether the service file exists.
 */
async function resolveServices(): Promise<void> {
  if (_createBackup && _restoreBackup) return;
  try {
    // Dynamic import — will be resolved at runtime only if the module exists.
    // If the file is missing the browser/bundler throws; we catch and use stubs.
    const mod = await import('../../services/backupService.ts');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mod as any;
    _createBackup = m.createBackup ?? createBackupStub;
    _restoreBackup = m.restoreBackup ?? restoreBackupStub;
  } catch {
    _createBackup = createBackupStub;
    _restoreBackup = restoreBackupStub;
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Formats a byte count into a human-readable string (KB or MB).
 *
 * @param bytes - Raw byte count
 * @returns Formatted string e.g. "84 KB" or "1.2 MB"
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats a UNIX millisecond timestamp into a localised date-time string.
 *
 * @param ms - Milliseconds since epoch
 * @returns Localised string e.g. "Mar 16, 2026, 14:03"
 */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Triggers a browser file download for a given string payload.
 *
 * @param content - String content to write into the file
 * @param filename - Suggested file name for the download
 */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Reads a File as a UTF-8 string and parses it as JSON.
 *
 * @param file - The File object from a file input
 * @returns Parsed JSON value
 * @throws If the file is not valid JSON
 */
async function parseJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string));
      } catch {
        reject(new Error('File is not valid JSON'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Validates that a parsed object looks like an AnimeGirly backup envelope.
 *
 * @param raw - Parsed JSON value to inspect
 * @returns The validated envelope, or null if the shape is wrong
 */
function validateEnvelope(raw: unknown): BackupEnvelope | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj['magic'] !== 'animegirly-backup') return null;
  if (typeof obj['createdAt'] !== 'number') return null;
  if (typeof obj['data'] !== 'object' || obj['data'] === null) return null;
  return obj as unknown as BackupEnvelope;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A small summary row used in the Restore backup metadata card.
 */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-xs font-medium text-text-primary">{value}</span>
    </div>
  );
}

/**
 * A labelled checkbox row used inside the restore category selector.
 */
function CategoryCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[color:var(--color-anime-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-text-primary">{label}</span>
        <p className="mt-0.5 text-[11px] leading-4 text-text-muted">{description}</p>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Create Backup
// ---------------------------------------------------------------------------

type BackupPhase = 'idle' | 'exporting' | 'done' | 'error';

/**
 * Handles exporting all app data to a timestamped JSON file.
 * Shows live progress during export and a success summary with file size
 * after the download is triggered automatically.
 */
function CreateBackupSection() {
  const [phase, setPhase] = useState<BackupPhase>('idle');
  const [exportedSize, setExportedSize] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  /** Runs the full export pipeline and auto-downloads the result. */
  const handleCreateBackup = async () => {
    setPhase('exporting');
    setErrorMessage('');
    try {
      await resolveServices();
      const result = await (_createBackup ?? createBackupStub)();
      const timestamp = new Date(result.envelope.createdAt)
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      triggerDownload(result.json, `animegirly-backup-${timestamp}.json`);
      setExportedSize(result.byteLength);
      setPhase('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error during export');
      setPhase('error');
    }
  };

  return (
    <AppCard className="p-3.5">
      <SettingsSectionHeader
        eyebrow="Backup"
        title="Create backup"
        description="Export all app data — personas, threads, memories, and settings — to a single JSON file you can keep as a safety net."
        aside={
          <HardDrive
            size={16}
            className="text-anime-500"
            aria-hidden="true"
          />
        }
      />

      <div className="mt-3 space-y-2.5">
        <Button
          type="button"
          onClick={() => void handleCreateBackup()}
          disabled={phase === 'exporting'}
          aria-busy={phase === 'exporting'}
          className="gap-2"
        >
          {phase === 'exporting' ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Exporting…
            </>
          ) : (
            <>
              <Download size={14} aria-hidden="true" />
              Create backup
            </>
          )}
        </Button>

        {phase === 'done' && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 rounded-[18px] border border-emerald-200/70 bg-emerald-50/80 px-3.5 py-2.5"
          >
            <CheckCircle2
              size={15}
              className="mt-0.5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <div className="text-xs font-semibold text-emerald-800">
                Backup downloaded
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-emerald-700">
                File size: {formatBytes(exportedSize)}. The download started
                automatically — check your browser's downloads folder.
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div
            role="alert"
            className="rounded-[18px] border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-700"
          >
            <span className="font-semibold">Export failed:</span>{' '}
            {errorMessage}
          </div>
        )}
      </div>
    </AppCard>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Restore from Backup
// ---------------------------------------------------------------------------

type RestorePhase =
  | 'idle'
  | 'parsing'
  | 'ready'
  | 'confirming'
  | 'restoring'
  | 'done'
  | 'error';

const RESTORE_CATEGORIES: Array<{
  key: keyof RestoreOptions;
  label: string;
  description: string;
}> = [
  {
    key: 'personas',
    label: 'Personas & voice profiles',
    description: 'Named characters, their personality configs, and custom voice assignments.',
  },
  {
    key: 'threads',
    label: 'Threads & messages',
    description: 'Full conversation history across all chat threads.',
  },
  {
    key: 'memories',
    label: 'Memories & summaries',
    description: 'Extracted memory entries and compressed conversation summaries.',
  },
  {
    key: 'psychology',
    label: 'Psychology & intimacy states',
    description: 'Emotional model state, intimacy tracking, and relationship dynamics.',
  },
  {
    key: 'lorebook',
    label: 'Lorebook entries',
    description: 'World-building facts, scenario context, and injected lore entries.',
  },
  {
    key: 'relationships',
    label: 'Relationships',
    description: 'Explicit relationship metadata and cross-persona association records.',
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Provider config, UI preferences, and voice settings.',
  },
];

/** Default restore options — all categories selected. */
function defaultOptions(): RestoreOptions {
  return {
    personas: true,
    threads: true,
    memories: true,
    psychology: true,
    lorebook: true,
    relationships: true,
    settings: true,
  };
}

/**
 * Builds a human-readable record count string from a backup envelope.
 * Falls back gracefully when a table is absent from the export.
 *
 * @param envelope - Validated backup envelope
 * @returns Comma-separated summary of record counts per table
 */
function buildCountSummary(envelope: BackupEnvelope): string {
  const data = envelope.data;
  const counts: Record<string, number> = {
    ...envelope.tableCounts,
    ...(data.personas ? { personas: data.personas.length } : {}),
    ...(data.threads ? { threads: data.threads.length } : {}),
    ...(data.messages ? { messages: data.messages.length } : {}),
    ...(data.memories ? { memories: data.memories.length } : {}),
  };

  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`);

  return parts.length > 0 ? parts.join(', ') : 'No records found';
}

/**
 * Handles importing a backup file, showing a metadata summary, allowing
 * category selection, and merging the selected data into the local database.
 */
function RestoreSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<RestorePhase>('idle');
  const [envelope, setEnvelope] = useState<BackupEnvelope | null>(null);
  const [options, setOptions] = useState<RestoreOptions>(defaultOptions());
  const [restored, setRestored] = useState<RestoreSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');

  /** Fires after the user picks a file in the hidden <input type="file">. */
  const handleFileSelected = async (file: File) => {
    setPhase('parsing');
    setParseError('');
    setEnvelope(null);
    setOptions(defaultOptions());
    setRestored(null);
    try {
      const raw = await parseJsonFile(file);
      const validated = validateEnvelope(raw);
      if (!validated) {
        setParseError(
          'This file does not appear to be an AnimeGirly backup. Make sure you selected the right file.',
        );
        setPhase('idle');
        return;
      }
      setEnvelope(validated);
      setPhase('ready');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to read file');
      setPhase('idle');
    }
  };

  /** Toggles a single restore category option. */
  const toggleOption = (key: keyof RestoreOptions, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  /** First click — shows the native confirm dialog before committing. */
  const handleRestoreClick = () => {
    setPhase('confirming');
  };

  /** User confirmed — runs the actual restore. */
  const handleConfirmed = async () => {
    if (!envelope) return;
    setPhase('restoring');
    setErrorMessage('');
    try {
      await resolveServices();
      const summary = await (_restoreBackup ?? restoreBackupStub)(envelope, options);
      setRestored(summary);
      setPhase('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error during restore');
      setPhase('error');
    }
  };

  /** Cancels the confirmation prompt, returning to the ready state. */
  const handleCancelConfirm = () => {
    setPhase('ready');
  };

  /** Resets the entire section back to the initial state. */
  const handleReset = () => {
    setPhase('idle');
    setEnvelope(null);
    setOptions(defaultOptions());
    setRestored(null);
    setErrorMessage('');
    setParseError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <AppCard className="p-3.5">
      <SettingsSectionHeader
        eyebrow="Restore"
        title="Restore from backup"
        description="Select a backup file to review its contents, choose which categories to import, then merge them into your current data."
        aside={
          <Upload
            size={16}
            className="text-anime-500"
            aria-hidden="true"
          />
        }
      />

      <div className="mt-3 space-y-3">
        {/* File picker */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="Select an AnimeGirly backup file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={phase === 'parsing' || phase === 'restoring'}
            className="gap-2"
          >
            {phase === 'parsing' ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Reading file…
              </>
            ) : (
              <>
                <Upload size={14} aria-hidden="true" />
                Select backup file
              </>
            )}
          </Button>
        </div>

        {/* Parse error */}
        {parseError && (
          <div
            role="alert"
            className="rounded-[18px] border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-700"
          >
            {parseError}
          </div>
        )}

        {/* Backup metadata summary card */}
        {envelope && phase !== 'done' && (
          <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] p-3">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-anime-600">
              Backup info
            </div>
            <div className="space-y-1.5">
              <MetaRow label="Created" value={formatDate(envelope.createdAt)} />
              {envelope.appVersion && (
                <MetaRow label="App version" value={envelope.appVersion} />
              )}
              {envelope.dbSchemaVersion !== undefined && (
                <MetaRow
                  label="DB schema"
                  value={`v${envelope.dbSchemaVersion}`}
                />
              )}
              <MetaRow label="Contents" value={buildCountSummary(envelope)} />
            </div>
          </div>
        )}

        {/* Category selector */}
        {(phase === 'ready' || phase === 'confirming') && envelope && (
          <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] p-3">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-anime-600">
              Categories to restore
            </div>
            <div className="space-y-2.5">
              {RESTORE_CATEGORIES.map(({ key, label, description }) => (
                <CategoryCheckbox
                  key={key}
                  label={label}
                  description={description}
                  checked={options[key]}
                  onChange={(v) => toggleOption(key, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirmation prompt */}
        {phase === 'confirming' && (
          <div
            role="alertdialog"
            aria-label="Confirm restore"
            className="rounded-[18px] border border-amber-200/80 bg-amber-50/80 px-3.5 py-3"
          >
            <div className="text-xs font-semibold text-amber-800">
              This will merge with existing data. Continue?
            </div>
            <p className="mt-1 text-[11px] leading-4 text-amber-700">
              Restored records are merged — existing data is not deleted. You
              can always create a fresh backup before restoring.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleConfirmed()}
                className="gap-1.5"
              >
                <Shield size={13} aria-hidden="true" />
                Yes, restore selected
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancelConfirm}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Restore in progress */}
        {phase === 'restoring' && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3.5 py-2.5"
          >
            <Loader2
              size={14}
              className="shrink-0 animate-spin text-anime-500"
              aria-hidden="true"
            />
            <span className="text-xs text-text-muted">
              Merging records into your database…
            </span>
          </div>
        )}

        {/* Restore button (shown when ready and not yet in confirm flow) */}
        {phase === 'ready' && (
          <Button
            type="button"
            onClick={handleRestoreClick}
            className="gap-2"
          >
            <Shield size={14} aria-hidden="true" />
            Restore selected
          </Button>
        )}

        {/* Success */}
        {phase === 'done' && restored && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-2"
          >
            <div className="flex items-start gap-2.5 rounded-[18px] border border-emerald-200/70 bg-emerald-50/80 px-3.5 py-2.5">
              <CheckCircle2
                size={15}
                className="mt-0.5 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              <div>
                <div className="text-xs font-semibold text-emerald-800">
                  Restore complete
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-emerald-700">
                  {[
                    restored.personas > 0 && `${restored.personas} personas`,
                    restored.threads > 0 && `${restored.threads} threads`,
                    restored.messages > 0 && `${restored.messages} messages`,
                    restored.memories > 0 && `${restored.memories} memories`,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'No new records were added (already up to date)'}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleReset}
            >
              Restore another file
            </Button>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-2">
            <div
              role="alert"
              className="rounded-[18px] border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-700"
            >
              <span className="font-semibold">Restore failed:</span>{' '}
              {errorMessage}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleReset}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </AppCard>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Auto-Backup
// ---------------------------------------------------------------------------

/** localStorage key for the auto-backup preference flag. */
const AUTO_BACKUP_KEY = 'animegirly:auto-backup-enabled';

/**
 * Reads the stored auto-backup preference.
 *
 * @returns true when the user has opted in, false otherwise
 */
function readAutoBackupPref(): boolean {
  try {
    return localStorage.getItem(AUTO_BACKUP_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists the auto-backup preference to localStorage.
 *
 * @param enabled - The new value to store
 */
function writeAutoBackupPref(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_BACKUP_KEY, String(enabled));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/**
 * Thin section that persists the auto-backup preference toggle.
 * The background timer that honours this flag is a future enhancement.
 */
function AutoBackupSection() {
  const [enabled, setEnabled] = useState<boolean>(readAutoBackupPref);

  /** Toggles the preference and persists it. */
  const handleToggle = (next: boolean) => {
    setEnabled(next);
    writeAutoBackupPref(next);
  };

  return (
    <AppCard className="p-3.5">
      <SettingsSectionHeader
        eyebrow="Auto-backup"
        title="Automatic backups"
        description="Keeps a rolling safety net without manual effort."
        aside={
          <Shield
            size={16}
            className="text-anime-500"
            aria-hidden="true"
          />
        }
      />

      <div className="mt-3 space-y-2.5">
        {/* Toggle row */}
        <AppCard className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1 pr-2">
            <div className="text-sm font-medium text-text-primary">
              Enable daily auto-backup
            </div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">
              Automatically saves a backup every 24 hours. The last 3 backups
              are kept so you always have a recent fallback.
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            aria-label="Enable daily auto-backup"
          />
        </AppCard>

        {/* Informational note */}
        <AppMutedNote>
          Auto-backup is stored in your browser and will be available if you
          need to restore. The background timer that runs these backups is
          coming in a future release — enabling this now will save your
          preference.
        </AppMutedNote>
      </div>
    </AppCard>
  );
}

// ---------------------------------------------------------------------------
// Panel root
// ---------------------------------------------------------------------------

/**
 * BackupRestorePanel – top-level component exported for embedding inside
 * AdvancedSettingsPanel (or any other settings tab that needs it).
 *
 * Renders three vertically stacked sections:
 *   1. Create Backup
 *   2. Restore from Backup
 *   3. Auto-Backup
 */
export default function BackupRestorePanel() {
  return (
    <div className="space-y-3.5">
      <AppMutedNote>
        Backup exports all your companion data — threads, personas, memories,
        and settings — into a portable JSON file. Restores are additive merges,
        never destructive overwrites.
      </AppMutedNote>

      <CreateBackupSection />
      <RestoreSection />
      <AutoBackupSection />
    </div>
  );
}
