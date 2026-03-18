import { describe, it, expect } from 'vitest';
import {
  scanForActivatedEntries,
  matchesTrigger,
  buildScanCorpus,
} from './lorebookScannerService.ts';
import { type LorebookEntry, type LorebookGlobalSettings } from '../types/lorebook.ts';
import { type ChatMessage } from '../types/index.ts';

/* ── Test helpers ── */

function createMockEntry(overrides: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    personaId: 'persona-test',
    name: 'Test Entry',
    triggers: [],
    secondaryTriggers: [],
    content: 'Test content.',
    priority: 50,
    enabled: true,
    constant: false,
    isAuthorsNote: false,
    authorsNoteDepth: 3,
    category: 'test',
    scanDepth: 0,
    caseSensitive: false,
    useRegex: false,
    selective: false,
    insertionOrder: 0,
    tokenEstimate: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createMockMessage(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id: `msg-${Date.now()}`, role, content, timestamp: Date.now() };
}

const defaultSettings: LorebookGlobalSettings = {
  defaultScanDepth: 10,
  maxBudgetPercent: 15,
  recursiveScanning: true,
  maxRecursiveDepth: 3,
  showActivationIndicator: true,
};

/* ── matchesTrigger ── */

describe('matchesTrigger', () => {
  it('matches plain substring case-insensitively', () => {
    expect(matchesTrigger('The MAGIC kingdom', 'magic', false, false)).toBe(true);
  });

  it('respects case-sensitive flag', () => {
    expect(matchesTrigger('The MAGIC kingdom', 'magic', true, false)).toBe(false);
    expect(matchesTrigger('The magic kingdom', 'magic', true, false)).toBe(true);
  });

  it('supports regex triggers', () => {
    expect(matchesTrigger('I saw three dragons', '\\bdragon\\w*\\b', false, true)).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    expect(matchesTrigger('test', '[invalid', false, true)).toBe(false);
  });

  it('returns false for empty trigger', () => {
    expect(matchesTrigger('some text', '', false, false)).toBe(false);
    expect(matchesTrigger('some text', '  ', false, false)).toBe(false);
  });
});

/* ── buildScanCorpus ── */

describe('buildScanCorpus', () => {
  it('concatenates last N messages', () => {
    const msgs = [
      createMockMessage('first'),
      createMockMessage('second'),
      createMockMessage('third'),
    ];
    const corpus = buildScanCorpus(msgs, 2);
    expect(corpus).toContain('second');
    expect(corpus).toContain('third');
    expect(corpus).not.toContain('first');
  });

  it('handles depth larger than message count', () => {
    const msgs = [createMockMessage('only one')];
    const corpus = buildScanCorpus(msgs, 10);
    expect(corpus).toBe('only one');
  });
});

/* ── scanForActivatedEntries ── */

describe('scanForActivatedEntries', () => {
  it('activates entry when trigger keyword found in message', () => {
    const entry = createMockEntry({ triggers: ['magic'], name: 'Mana Burn' });
    const msgs = [createMockMessage('Can you cast a magic spell?')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].name).toBe('Mana Burn');
  });

  it('does not activate when no triggers match', () => {
    const entry = createMockEntry({ triggers: ['magic'] });
    const msgs = [createMockMessage('The weather is nice today.')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
  });

  it('matches case-insensitively by default', () => {
    const entry = createMockEntry({ triggers: ['Magic'] });
    const msgs = [createMockMessage('MAGIC is everywhere')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
  });

  it('respects case-sensitive flag', () => {
    const entry = createMockEntry({ triggers: ['Magic'], caseSensitive: true });
    const msgs = [createMockMessage('magic is everywhere')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
  });

  it('supports regex triggers', () => {
    const entry = createMockEntry({ triggers: ['\\bdragon\\w*\\b'], useRegex: true });
    const msgs = [createMockMessage('I saw three dragons')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
  });

  it('handles invalid regex gracefully', () => {
    const entry = createMockEntry({ triggers: ['[invalid'], useRegex: true });
    const msgs = [createMockMessage('test')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
  });

  it('requires secondary triggers when selective is true', () => {
    const entry = createMockEntry({
      triggers: ['dragon'],
      secondaryTriggers: ['fire'],
      selective: true,
    });
    const msgs = [createMockMessage('The dragon sleeps.')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
  });

  it('activates selective entry when both primary and secondary match', () => {
    const entry = createMockEntry({
      triggers: ['dragon'],
      secondaryTriggers: ['fire'],
      selective: true,
    });
    const msgs = [createMockMessage('The dragon breathes fire.')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
  });

  it('always includes constant entries', () => {
    const entry = createMockEntry({ constant: true, name: 'Always On' });
    const msgs = [createMockMessage('Unrelated message.')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].name).toBe('Always On');
  });

  it('separates authors note from regular entries', () => {
    const regular = createMockEntry({ triggers: ['magic'], name: 'Lore' });
    const authorsNote = createMockEntry({
      constant: true,
      isAuthorsNote: true,
      authorsNoteDepth: 3,
      content: 'Write with gothic tone.',
      name: 'AN',
    });
    const msgs = [createMockMessage('Tell me about magic.')];
    const result = scanForActivatedEntries([regular, authorsNote], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].name).toBe('Lore');
    expect(result.authorsNote).not.toBeNull();
    expect(result.authorsNote!.content).toBe('Write with gothic tone.');
    expect(result.authorsNote!.depth).toBe(3);
  });

  it('sorts by priority descending then insertionOrder ascending', () => {
    const low = createMockEntry({ triggers: ['test'], priority: 10, insertionOrder: 0, name: 'Low' });
    const high = createMockEntry({ triggers: ['test'], priority: 90, insertionOrder: 0, name: 'High' });
    const mid = createMockEntry({ triggers: ['test'], priority: 50, insertionOrder: 1, name: 'Mid-1' });
    const mid2 = createMockEntry({ triggers: ['test'], priority: 50, insertionOrder: 0, name: 'Mid-0' });
    const msgs = [createMockMessage('test')];
    const result = scanForActivatedEntries([low, high, mid, mid2], msgs, defaultSettings);
    const names = result.activatedEntries.map((e) => e.name);
    expect(names).toEqual(['High', 'Mid-0', 'Mid-1', 'Low']);
  });

  it('enforces budget cap', () => {
    // Create entries that collectively exceed 15% of a 100-token window
    const entries = Array.from({ length: 10 }, (_, i) =>
      createMockEntry({ triggers: ['test'], tokenEstimate: 5, name: `Entry-${i}`, id: `e-${i}` }),
    );
    const msgs = [createMockMessage('test')];
    // 15% of 100 = 15 tokens max → only 3 entries fit (3 × 5 = 15)
    const result = scanForActivatedEntries(entries, msgs, defaultSettings, 100);
    expect(result.activatedEntries.length).toBeLessThanOrEqual(3);
    expect(result.truncatedCount).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(15);
  });

  it('skips disabled entries', () => {
    const entry = createMockEntry({ triggers: ['test'], enabled: false });
    const msgs = [createMockMessage('test')];
    const result = scanForActivatedEntries([entry], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
  });

  it('handles empty entries array', () => {
    const result = scanForActivatedEntries([], [createMockMessage('test')], defaultSettings);
    expect(result.activatedEntries).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  it('handles empty messages array', () => {
    const constant = createMockEntry({ constant: true, name: 'Always', content: 'World lore.' });
    const triggered = createMockEntry({ triggers: ['unicorn'] });
    const result = scanForActivatedEntries([constant, triggered], [], defaultSettings);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].name).toBe('Always');
  });

  it('performs recursive activation', () => {
    // Entry A triggers on "magic", its content contains "dragon"
    // Entry B triggers on "dragon"
    const entryA = createMockEntry({
      triggers: ['magic'],
      content: 'Magic in this world is powered by dragon blood.',
      name: 'Magic Lore',
      id: 'a',
    });
    const entryB = createMockEntry({
      triggers: ['dragon'],
      content: 'Dragons are ancient creatures.',
      name: 'Dragon Lore',
      id: 'b',
    });
    const msgs = [createMockMessage('Tell me about magic.')];
    const result = scanForActivatedEntries([entryA, entryB], msgs, defaultSettings);
    expect(result.activatedEntries).toHaveLength(2);
    const names = result.activatedEntries.map((e) => e.name);
    expect(names).toContain('Magic Lore');
    expect(names).toContain('Dragon Lore');
  });
});
