/**
 * Tests for the pure validation and summary helpers in backupService.
 *
 * DB-dependent functions (createBackup, restoreFromBackup) are not tested
 * here because they require a live IndexedDB environment — those belong in
 * integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  validateBackupFile,
  getBackupSummary,
  type BackupEnvelope,
} from './backupService.ts';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal but structurally valid BackupEnvelope for use in tests.
 * Pass `overrides` to patch any field without rewriting the entire object.
 *
 * @param overrides - Partial object merged into the default envelope.
 * @returns A fully-populated BackupEnvelope (or a mutated variant for invalid tests).
 */
function createMockEnvelope(overrides: Record<string, unknown> = {}): BackupEnvelope {
  return {
    magic: 'animegirly-backup',
    formatVersion: 1,
    dbSchemaVersion: 5,
    createdAt: 1_710_000_000_000,
    appVersion: '1.0.0',
    tableCounts: {
      settings: 2,
      threads: 5,
      messages: 100,
      personas: 3,
      voiceProfiles: 1,
      threadSummaries: 5,
      memoryRecords: 10,
      intimacyStates: 2,
      psychologyStates: 2,
      lorebookEntries: 0,
      milestones: 0,
      moodJournal: 0,
      relationships: 0,
    },
    data: {
      settings: [],
      threads: [],
      messages: [],
      personas: [],
      voiceProfiles: [],
      threadSummaries: [],
      memoryRecords: [],
      intimacyStates: [],
      psychologyStates: [],
      lorebookEntries: [],
      milestones: [],
      moodJournal: [],
      relationships: [],
      localStorage: {},
    },
    ...overrides,
  } as BackupEnvelope;
}

// ─── validateBackupFile ───────────────────────────────────────────────────────

describe('validateBackupFile', () => {
  it('returns valid: true with the envelope when given a structurally correct object', () => {
    const envelope = createMockEnvelope();
    const result = validateBackupFile(envelope);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.envelope).toBe(envelope);
    }
  });

  it('returns valid: false with an error message when the magic field is missing', () => {
    const bad = createMockEnvelope({ magic: undefined });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid: false when the magic field contains the wrong string', () => {
    const bad = createMockEnvelope({ magic: 'other-app-backup' });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/animegirly-backup/);
  });

  it('returns valid: false when formatVersion is not 1', () => {
    const bad = createMockEnvelope({ formatVersion: 2 });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('returns valid: false when formatVersion is 0', () => {
    const bad = createMockEnvelope({ formatVersion: 0 });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
  });

  it('returns valid: false for null input', () => {
    const result = validateBackupFile(null);

    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid: false for undefined input', () => {
    const result = validateBackupFile(undefined);

    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid: false for a plain number', () => {
    const result = validateBackupFile(42);

    expect(result.valid).toBe(false);
  });

  it('returns valid: false for a plain string', () => {
    const result = validateBackupFile('animegirly-backup');

    expect(result.valid).toBe(false);
  });

  it('returns valid: false for an array', () => {
    const result = validateBackupFile([]);

    expect(result.valid).toBe(false);
  });

  it('returns valid: false when the data field is missing', () => {
    const bad = createMockEnvelope({ data: undefined });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/data/i);
  });

  it('returns valid: false when the data field is null', () => {
    const bad = createMockEnvelope({ data: null });
    const result = validateBackupFile(bad);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/data/i);
  });

  it('returns valid: false for an empty object', () => {
    const result = validateBackupFile({});

    expect(result.valid).toBe(false);
  });

  it('does not expose envelope on a failed result', () => {
    const result = validateBackupFile({ magic: 'wrong' });

    expect(result.valid).toBe(false);
    // The discriminated union guarantees envelope is undefined when invalid.
    expect((result as { envelope?: unknown }).envelope).toBeUndefined();
  });
});

// ─── getBackupSummary ─────────────────────────────────────────────────────────

describe('getBackupSummary', () => {
  it('returns correct counts from a fully populated tableCounts map', () => {
    const envelope = createMockEnvelope();
    const summary = getBackupSummary(envelope);

    expect(summary.personaCount).toBe(3);
    expect(summary.threadCount).toBe(5);
    expect(summary.messageCount).toBe(100);
    expect(summary.memoryCount).toBe(10);
  });

  it('returns the createdAt timestamp from the envelope', () => {
    const envelope = createMockEnvelope();
    const summary = getBackupSummary(envelope);

    expect(summary.createdAt).toBe(1_710_000_000_000);
  });

  it('returns 0 for persona count when the personas key is absent from tableCounts', () => {
    const envelope = createMockEnvelope();
    const tableCounts = { ...envelope.tableCounts };
    delete (tableCounts as Record<string, unknown>)['personas'];
    const sparse = { ...envelope, tableCounts };

    const summary = getBackupSummary(sparse);
    expect(summary.personaCount).toBe(0);
  });

  it('returns 0 for thread count when the threads key is absent from tableCounts', () => {
    const envelope = createMockEnvelope();
    const tableCounts = { ...envelope.tableCounts };
    delete (tableCounts as Record<string, unknown>)['threads'];
    const sparse = { ...envelope, tableCounts };

    const summary = getBackupSummary(sparse);
    expect(summary.threadCount).toBe(0);
  });

  it('returns 0 for message count when the messages key is absent from tableCounts', () => {
    const envelope = createMockEnvelope();
    const tableCounts = { ...envelope.tableCounts };
    delete (tableCounts as Record<string, unknown>)['messages'];
    const sparse = { ...envelope, tableCounts };

    const summary = getBackupSummary(sparse);
    expect(summary.messageCount).toBe(0);
  });

  it('returns 0 for memory count when the memoryRecords key is absent from tableCounts', () => {
    const envelope = createMockEnvelope();
    const tableCounts = { ...envelope.tableCounts };
    delete (tableCounts as Record<string, unknown>)['memoryRecords'];
    const sparse = { ...envelope, tableCounts };

    const summary = getBackupSummary(sparse);
    expect(summary.memoryCount).toBe(0);
  });

  it('returns 0 for all counts when tableCounts is an empty object', () => {
    const envelope = { ...createMockEnvelope(), tableCounts: {} };
    const summary = getBackupSummary(envelope);

    expect(summary.personaCount).toBe(0);
    expect(summary.threadCount).toBe(0);
    expect(summary.messageCount).toBe(0);
    expect(summary.memoryCount).toBe(0);
  });

  it('handles a single-persona database correctly', () => {
    const envelope = createMockEnvelope({
      tableCounts: { personas: 1, threads: 2, messages: 20, memoryRecords: 3 },
    });
    const summary = getBackupSummary(envelope);

    expect(summary.personaCount).toBe(1);
  });

  it('handles very large counts without overflow', () => {
    const envelope = createMockEnvelope({
      tableCounts: {
        personas: 999,
        threads: 10_000,
        messages: 500_000,
        memoryRecords: 50_000,
      },
    });
    const summary = getBackupSummary(envelope);

    expect(summary.personaCount).toBe(999);
    expect(summary.threadCount).toBe(10_000);
    expect(summary.messageCount).toBe(500_000);
    expect(summary.memoryCount).toBe(50_000);
  });
});
