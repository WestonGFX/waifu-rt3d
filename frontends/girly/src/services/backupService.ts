/**
 * backupService – Full data backup and restore for AnimeGirly.
 *
 * Serialises every IndexedDB table and every `animegirly`-prefixed
 * localStorage key into a single JSON envelope, and provides the
 * corresponding restore path that writes data back atomically via a
 * Dexie transaction.
 *
 * The backup format is intentionally plain JSON so users can inspect,
 * version-control, or diff their backups without special tooling.
 *
 * @module backupService
 */

import { appDb } from '@/services/appDb';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * The categories of data that can be selectively restored.
 * Maps loosely to IndexedDB table groups so the UI can offer
 * "restore personas only" or "restore everything" checkboxes.
 */
export type BackupCategory =
  | 'personas'
  | 'threads'
  | 'messages'
  | 'memories'
  | 'voice'
  | 'lorebook'
  | 'psychology'
  | 'settings'
  | 'relationships';

/**
 * The raw data payload inside a backup envelope.
 * Every field is typed as `unknown[]` or `Record<string, string>` because
 * the records are extracted from IndexedDB without re-validating their
 * full TypeScript shapes — we treat them as opaque blobs during
 * backup/restore and let Dexie handle the actual storage.
 */
export interface BackupData {
  /** AppSettingRecord rows from the `settings` table. */
  settings: Record<string, unknown>[];
  /** ChatThread rows. */
  threads: unknown[];
  /** ThreadMessageRecord rows. */
  messages: unknown[];
  /** PersonaProfile rows. */
  personas: unknown[];
  /** TTSVoiceProfile rows. */
  voiceProfiles: unknown[];
  /** ThreadSummaryRecord rows. */
  threadSummaries: unknown[];
  /** MemoryRecord rows. */
  memoryRecords: unknown[];
  /** IntimacyStateRecord rows. */
  intimacyStates: unknown[];
  /** PsychologyStateRecord rows. */
  psychologyStates: unknown[];
  /** LorebookEntry rows. */
  lorebookEntries: unknown[];
  /** MilestoneRecord rows. */
  milestones: unknown[];
  /** MoodJournalEntry rows. */
  moodJournal: unknown[];
  /** CharacterRelationship rows. */
  relationships: unknown[];
  /**
   * All `animegirly`-prefixed localStorage keys captured as
   * `{ key: serialisedValue }` pairs.
   */
  localStorage: Record<string, string>;
}

/**
 * Top-level wrapper written to disk.
 *
 * The `magic` string lets `validateBackupFile` quickly reject unrelated
 * JSON blobs before attempting any further parsing.
 */
export interface BackupEnvelope {
  /** Discriminator string — always `'animegirly-backup'`. */
  magic: 'animegirly-backup';
  /** Incremented only when the envelope structure itself changes. */
  formatVersion: 1;
  /** The Dexie schema version active when the backup was created. */
  dbSchemaVersion: number;
  /** Unix timestamp (ms) of when the backup was created. */
  createdAt: number;
  /** Human-readable app version string. */
  appVersion: string;
  /** Row counts keyed by table name, useful for quick UI summaries. */
  tableCounts: Record<string, number>;
  /** The actual data. */
  data: BackupData;
}

/**
 * Result of `validateBackupFile` — always a discriminated union so
 * callers can branch on `valid` without casting.
 */
export type BackupValidationResult =
  | { valid: true; envelope: BackupEnvelope }
  | { valid: false; error: string; envelope?: undefined };

// ─── Constants ────────────────────────────────────────────────────────────────

/** The current Dexie schema version (matches the highest version() call in appDb.ts). */
const DB_SCHEMA_VERSION = 5;

/** Semantic app version — bump manually when shipping a release. */
const APP_VERSION = '1.0.0';

/** Prefix used to filter relevant localStorage keys. */
const LS_PREFIX = 'animegirly';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reads all `animegirly`-prefixed keys from `localStorage` and returns
 * them as a plain string-to-string map.
 *
 * @returns A record of every matching key and its raw string value.
 *
 * @example
 * const ls = captureLocalStorage();
 * // { 'animegirly_state': '{"setupComplete":true,...}' }
 */
function captureLocalStorage(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(localStorage).filter(([k]) => k.startsWith(LS_PREFIX)),
  );
}

/**
 * Restores localStorage entries from a backup snapshot.
 * Existing keys are overwritten; keys absent from the snapshot are left
 * untouched so unrelated browser state is not disturbed.
 *
 * @param snapshot - The `localStorage` map previously captured by `createBackup`.
 */
function restoreLocalStorage(snapshot: Record<string, string>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    try {
      localStorage.setItem(key, value);
    } catch {
      console.warn(`[backupService] Could not restore localStorage key: ${key}`);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a full backup of all application data.
 *
 * Reads every IndexedDB table via `toArray()` and captures all
 * `animegirly`-prefixed localStorage keys. The resulting envelope is
 * safe to serialise with `JSON.stringify`.
 *
 * @returns A fully-populated `BackupEnvelope` ready for download or storage.
 *
 * @example
 * const envelope = await createBackup();
 * downloadBackup(envelope);
 */
export async function createBackup(): Promise<BackupEnvelope> {
  const [
    settings,
    threads,
    messages,
    personas,
    voiceProfiles,
    threadSummaries,
    memoryRecords,
    intimacyStates,
    psychologyStates,
    lorebookEntries,
    milestones,
    moodJournal,
    relationships,
  ] = await Promise.all([
    appDb.table('settings').toArray(),
    appDb.table('threads').toArray(),
    appDb.table('messages').toArray(),
    appDb.table('personas').toArray(),
    appDb.table('voiceProfiles').toArray(),
    appDb.table('threadSummaries').toArray(),
    appDb.table('memoryRecords').toArray(),
    appDb.table('intimacyStates').toArray(),
    appDb.table('psychologyStates').toArray(),
    appDb.table('lorebookEntries').toArray(),
    appDb.table('milestones').toArray(),
    appDb.table('moodJournal').toArray(),
    appDb.table('relationships').toArray(),
  ]);

  const ls = captureLocalStorage();

  const data: BackupData = {
    settings: settings as Record<string, unknown>[],
    threads,
    messages,
    personas,
    voiceProfiles,
    threadSummaries,
    memoryRecords,
    intimacyStates,
    psychologyStates,
    lorebookEntries,
    milestones,
    moodJournal,
    relationships,
    localStorage: ls,
  };

  const tableCounts: Record<string, number> = {
    settings: settings.length,
    threads: threads.length,
    messages: messages.length,
    personas: personas.length,
    voiceProfiles: voiceProfiles.length,
    threadSummaries: threadSummaries.length,
    memoryRecords: memoryRecords.length,
    intimacyStates: intimacyStates.length,
    psychologyStates: psychologyStates.length,
    lorebookEntries: lorebookEntries.length,
    milestones: milestones.length,
    moodJournal: moodJournal.length,
    relationships: relationships.length,
  };

  return {
    magic: 'animegirly-backup',
    formatVersion: 1,
    dbSchemaVersion: DB_SCHEMA_VERSION,
    createdAt: Date.now(),
    appVersion: APP_VERSION,
    tableCounts,
    data,
  };
}

/**
 * Restores selected categories of data from a validated backup envelope.
 *
 * Each category is written via `bulkPut` inside a single Dexie `rw`
 * transaction so the operation is atomic — either all rows for the
 * selected categories land, or none do. If the backup was created on an
 * older schema version, Dexie will still accept the rows (it stores
 * whatever object you give it; index fields that did not exist yet are
 * simply ignored).
 *
 * @param envelope - A previously validated `BackupEnvelope`.
 * @param categories - Which categories to restore. Pass all values of
 *   `BackupCategory` to perform a full restore.
 * @returns An object whose `restoredCounts` map each table name to the
 *   number of rows that were written.
 *
 * @example
 * const result = await restoreFromBackup(envelope, ['personas', 'threads']);
 * console.log(result.restoredCounts); // { personas: 3, threads: 12 }
 */
export async function restoreFromBackup(
  envelope: BackupEnvelope,
  categories: BackupCategory[],
): Promise<{ restoredCounts: Record<string, number> }> {
  const validation = validateBackupFile(envelope);
  if (!validation.valid) {
    throw new Error(`Cannot restore: ${validation.error}`);
  }

  const { data } = envelope;
  const restoredCounts: Record<string, number> = {};

  const categorySet = new Set(categories);

  await appDb.transaction(
    'rw',
    appDb.settings,
    appDb.threads,
    appDb.messages,
    appDb.personas,
    appDb.voiceProfiles,
    appDb.threadSummaries,
    appDb.memoryRecords,
    appDb.intimacyStates,
    appDb.psychologyStates,
    appDb.lorebookEntries,
    appDb.milestones,
    appDb.moodJournal,
    appDb.relationships,
    async () => {
      if (categorySet.has('settings') && data.settings.length > 0) {
        await appDb.table('settings').bulkPut(data.settings);
        restoredCounts['settings'] = data.settings.length;
      }

      if (categorySet.has('threads') && data.threads.length > 0) {
        await appDb.table('threads').bulkPut(data.threads);
        restoredCounts['threads'] = data.threads.length;
      }

      if (categorySet.has('messages') && data.messages.length > 0) {
        await appDb.table('messages').bulkPut(data.messages);
        restoredCounts['messages'] = data.messages.length;
      }

      if (categorySet.has('personas') && data.personas.length > 0) {
        await appDb.table('personas').bulkPut(data.personas);
        restoredCounts['personas'] = data.personas.length;
      }

      if (categorySet.has('voice') && data.voiceProfiles.length > 0) {
        await appDb.table('voiceProfiles').bulkPut(data.voiceProfiles);
        restoredCounts['voiceProfiles'] = data.voiceProfiles.length;
      }

      if (categorySet.has('memories')) {
        if (data.threadSummaries.length > 0) {
          await appDb.table('threadSummaries').bulkPut(data.threadSummaries);
          restoredCounts['threadSummaries'] = data.threadSummaries.length;
        }
        if (data.memoryRecords.length > 0) {
          await appDb.table('memoryRecords').bulkPut(data.memoryRecords);
          restoredCounts['memoryRecords'] = data.memoryRecords.length;
        }
      }

      if (categorySet.has('psychology')) {
        if (data.intimacyStates.length > 0) {
          await appDb.table('intimacyStates').bulkPut(data.intimacyStates);
          restoredCounts['intimacyStates'] = data.intimacyStates.length;
        }
        if (data.psychologyStates.length > 0) {
          await appDb.table('psychologyStates').bulkPut(data.psychologyStates);
          restoredCounts['psychologyStates'] = data.psychologyStates.length;
        }
        if (data.milestones.length > 0) {
          await appDb.table('milestones').bulkPut(data.milestones);
          restoredCounts['milestones'] = data.milestones.length;
        }
        if (data.moodJournal.length > 0) {
          await appDb.table('moodJournal').bulkPut(data.moodJournal);
          restoredCounts['moodJournal'] = data.moodJournal.length;
        }
      }

      if (categorySet.has('lorebook') && data.lorebookEntries.length > 0) {
        await appDb.table('lorebookEntries').bulkPut(data.lorebookEntries);
        restoredCounts['lorebookEntries'] = data.lorebookEntries.length;
      }

      if (categorySet.has('relationships') && data.relationships.length > 0) {
        await appDb.table('relationships').bulkPut(data.relationships);
        restoredCounts['relationships'] = data.relationships.length;
      }
    },
  );

  // localStorage is restored outside the Dexie transaction because it
  // is a separate synchronous store — partial failures here are unlikely
  // and do not affect DB integrity.
  if (categorySet.has('settings') && Object.keys(data.localStorage).length > 0) {
    restoreLocalStorage(data.localStorage);
    restoredCounts['localStorage'] = Object.keys(data.localStorage).length;
  }

  return { restoredCounts };
}

/**
 * Validates the top-level shape of a value parsed from a backup file.
 *
 * Checks that the magic string is correct, the format version is
 * supported, and the `data` field is present. Does NOT deep-validate
 * individual row schemas — that is Dexie's responsibility on write.
 *
 * @param json - Any value, typically the result of `JSON.parse` on a
 *   candidate backup file.
 * @returns A discriminated union: `{ valid: true, envelope }` on
 *   success, or `{ valid: false, error }` on failure.
 *
 * @example
 * const result = validateBackupFile(JSON.parse(rawText));
 * if (!result.valid) console.error(result.error);
 */
export function validateBackupFile(json: unknown): BackupValidationResult {
  if (json === null || typeof json !== 'object') {
    return { valid: false, error: 'File is not a JSON object.' };
  }

  const obj = json as Record<string, unknown>;

  if (obj['magic'] !== 'animegirly-backup') {
    return {
      valid: false,
      error: `Unrecognised file format — expected magic "animegirly-backup", got "${String(obj['magic'])}"`,
    };
  }

  if (obj['formatVersion'] !== 1) {
    return {
      valid: false,
      error: `Unsupported backup format version ${String(obj['formatVersion'])}. Only version 1 is supported.`,
    };
  }

  if (!obj['data'] || typeof obj['data'] !== 'object') {
    return { valid: false, error: 'Backup file is missing the required "data" field.' };
  }

  return { valid: true, envelope: obj as unknown as BackupEnvelope };
}

/**
 * Serialises an envelope to JSON and triggers a browser file download.
 *
 * The filename embeds the creation timestamp so multiple backups do not
 * overwrite each other on disk.
 *
 * @param envelope - The backup envelope to serialise and download.
 *
 * @example
 * const envelope = await createBackup();
 * downloadBackup(envelope);
 * // → triggers download of "animegirly-backup-1710000000000.animegirly-backup.json"
 */
export function downloadBackup(envelope: BackupEnvelope): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `animegirly-backup-${envelope.createdAt}.animegirly-backup.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke the object URL on next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Reads a `File` object selected by the user, parses the JSON, and
 * validates the resulting backup envelope.
 *
 * @param file - A `File` instance from an `<input type="file">` element.
 * @returns A `BackupValidationResult` augmented with async error handling
 *   for I/O and parse failures.
 *
 * @example
 * const input = document.querySelector('input[type="file"]');
 * input.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const result = await parseBackupFile(file);
 *   if (result.valid) console.log('Ready to restore', result.envelope);
 * });
 */
export async function parseBackupFile(
  file: File,
): Promise<BackupValidationResult> {
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return { valid: false, error: `Could not read file: ${String(err)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { valid: false, error: 'File is not valid JSON.' };
  }

  return validateBackupFile(parsed);
}

/**
 * Extracts a concise human-readable summary from a backup envelope.
 *
 * Intended for display in the restore UI so users can confirm they are
 * restoring the correct backup before committing.
 *
 * @param envelope - A validated `BackupEnvelope`.
 * @returns Key counts and the original creation timestamp.
 *
 * @example
 * const summary = getBackupSummary(envelope);
 * console.log(`${summary.personaCount} personas, created ${new Date(summary.createdAt)}`);
 */
export function getBackupSummary(envelope: BackupEnvelope): {
  personaCount: number;
  threadCount: number;
  messageCount: number;
  memoryCount: number;
  createdAt: number;
} {
  const { tableCounts, createdAt } = envelope;
  return {
    personaCount: tableCounts['personas'] ?? 0,
    threadCount: tableCounts['threads'] ?? 0,
    messageCount: tableCounts['messages'] ?? 0,
    memoryCount: tableCounts['memoryRecords'] ?? 0,
    createdAt,
  };
}
