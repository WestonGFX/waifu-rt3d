/**
 * Tests for workingMemoryService — pure extraction and formatting functions.
 * All tests use a fixed timestamp to remain deterministic.
 */

import { describe, it, expect } from 'vitest';
import { type ChatMessage } from '../types/index.ts';
import { type MemoryRecord } from '../types/companion.ts';
import {
  type WorkingMemoryFact,
  extractWorkingMemoryFacts,
  buildWorkingMemoryBlock,
  deduplicateWithLongTerm,
} from './workingMemoryService.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal ChatMessage for test use. */
function makeMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  timestamp = 1_000,
): ChatMessage {
  return { id, role, content, timestamp };
}

/**
 * Creates a minimal MemoryRecord for test use.
 * Only `id` and `text` are semantically meaningful for these tests.
 */
function makeMemoryRecord(id: string, text: string): MemoryRecord {
  return {
    id,
    personaId: 'persona-test',
    threadId: 'thread-test',
    kind: 'fact',
    text,
    salience: 0.7,
    confidence: 0.75,
    createdAt: 1_000,
    sourceMessageIds: [],
  };
}

// ---------------------------------------------------------------------------
// extractWorkingMemoryFacts
// ---------------------------------------------------------------------------

describe('extractWorkingMemoryFacts', () => {
  it('detects "my name is X" and assigns category name', () => {
    const messages = [makeMessage('u1', 'user', 'My name is Alex.')];
    const facts = extractWorkingMemoryFacts(messages);

    const nameFact = facts.find((f) => f.category === 'name');
    expect(nameFact).toBeDefined();
    expect(nameFact?.text.toLowerCase()).toContain('alex');
  });

  it('detects "call me X" and assigns category name', () => {
    const messages = [makeMessage('u1', 'user', 'You can call me Lexi.')];
    const facts = extractWorkingMemoryFacts(messages);

    const nameFact = facts.find((f) => f.category === 'name');
    expect(nameFact).toBeDefined();
    expect(nameFact?.text.toLowerCase()).toContain('lexi');
  });

  it('detects "I love hiking" and assigns category preference', () => {
    const messages = [makeMessage('u1', 'user', 'I love hiking on weekends.')];
    const facts = extractWorkingMemoryFacts(messages);

    const prefFact = facts.find((f) => f.category === 'preference');
    expect(prefFact).toBeDefined();
    expect(prefFact?.text.toLowerCase()).toContain('hiking');
  });

  it('detects "I like X" and assigns category preference', () => {
    const messages = [makeMessage('u1', 'user', 'I like reading fantasy novels.')];
    const facts = extractWorkingMemoryFacts(messages);

    const prefFact = facts.find((f) => f.category === 'preference');
    expect(prefFact).toBeDefined();
    expect(prefFact?.text.toLowerCase()).toContain('reading');
  });

  it('detects "I enjoy X" and assigns category preference', () => {
    const messages = [makeMessage('u1', 'user', "I enjoy cooking at home.")];
    const facts = extractWorkingMemoryFacts(messages);

    const prefFact = facts.find((f) => f.category === 'preference');
    expect(prefFact).toBeDefined();
    expect(prefFact?.text.toLowerCase()).toContain('cooking');
  });

  it('detects "I am a nurse" and assigns category fact', () => {
    // NOTE: The bio-fact regex matches "i am a" or "i work as" but NOT "i'm a"
    // (the contraction without a space). Use "I am a" to trigger the match.
    const messages = [makeMessage('u1', 'user', 'I am a nurse at the local hospital.')];
    const facts = extractWorkingMemoryFacts(messages);

    const bioFact = facts.find((f) => f.category === 'fact');
    expect(bioFact).toBeDefined();
    expect(bioFact?.text.toLowerCase()).toContain('nurse');
  });

  it('detects "I work as a teacher" and assigns category fact', () => {
    const messages = [makeMessage('u1', 'user', 'I work as a teacher.')];
    const facts = extractWorkingMemoryFacts(messages);

    const bioFact = facts.find((f) => f.category === 'fact');
    expect(bioFact).toBeDefined();
    expect(bioFact?.text.toLowerCase()).toContain('teacher');
  });

  it('detects "I feel stressed" and assigns category emotion', () => {
    const messages = [makeMessage('u1', 'user', 'I feel stressed about the deadline.')];
    const facts = extractWorkingMemoryFacts(messages);

    const emotionFact = facts.find((f) => f.category === 'emotion');
    expect(emotionFact).toBeDefined();
    expect(emotionFact?.text.toLowerCase()).toContain('stress');
  });

  it('detects "I\'m feeling anxious" and assigns category emotion', () => {
    const messages = [makeMessage('u1', 'user', "I'm feeling anxious about the presentation.")];
    const facts = extractWorkingMemoryFacts(messages);

    const emotionFact = facts.find((f) => f.category === 'emotion');
    expect(emotionFact).toBeDefined();
    expect(emotionFact?.text.toLowerCase()).toContain('anxi');
  });

  it('returns empty array for a message with no extractable facts', () => {
    const messages = [makeMessage('u1', 'user', 'What is the weather like today?')];
    const facts = extractWorkingMemoryFacts(messages);
    expect(facts).toHaveLength(0);
  });

  it('returns empty array for an empty message array', () => {
    expect(extractWorkingMemoryFacts([])).toHaveLength(0);
  });

  it('ignores assistant messages — only user messages contribute facts', () => {
    const messages = [
      makeMessage('a1', 'assistant', "Your name is Alex. I'm a nurse too."),
    ];
    const facts = extractWorkingMemoryFacts(messages);
    expect(facts).toHaveLength(0);
  });

  it('ignores director messages — only user messages contribute facts', () => {
    const messages = [
      { id: 'd1', role: 'director' as const, content: "I'm a nurse. My name is Sam.", timestamp: 1 },
    ];
    const facts = extractWorkingMemoryFacts(messages);
    expect(facts).toHaveLength(0);
  });

  it('extracts multiple fact categories from a single information-dense message', () => {
    // The name regex requires the name to be followed by sentence-ending punctuation
    // or end-of-string due to the (?:[.!?,]|$) anchor.  Using a period after the
    // name ensures the regex anchors correctly.  The bio-fact regex also requires
    // "I am a" (not the contracted "I'm a") for job extraction.
    const messages = [
      makeMessage(
        'u1',
        'user',
        "My name is Jordan. I am a software engineer. I love hiking and I feel excited about my new job.",
      ),
    ];
    const facts = extractWorkingMemoryFacts(messages);
    const categories = facts.map((f) => f.category);

    expect(categories).toContain('name');
    expect(categories).toContain('fact');
    expect(categories).toContain('preference');
  });

  it('deduplicates identical facts from the same message scan', () => {
    // Both messages express the same preference; the dedup in the service should prevent doubles.
    const messages = [
      makeMessage('u1', 'user', 'I love hiking.'),
      makeMessage('u2', 'user', 'I love hiking.'),
    ];
    const facts = extractWorkingMemoryFacts(messages);
    const prefFacts = facts.filter((f) => f.category === 'preference');
    // At most one deduplicated preference about hiking.
    expect(prefFacts.length).toBeLessThanOrEqual(1);
  });

  it('limits output to a maximum of 15 facts even when many patterns match', () => {
    // Build 20 messages each with a different preference/fact to try to exceed the limit.
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(`u${i}`, 'user', `I love activity${i} and I'm a specialist${i}.`),
    );
    const facts = extractWorkingMemoryFacts(messages);
    expect(facts.length).toBeLessThanOrEqual(15);
  });

  it('scans only the last 10 messages when history is longer', () => {
    // Place a distinctive name in message 1 (out of 15 messages).
    // The scan window is the last 10, so message 1 is outside the window.
    const messages = [
      makeMessage('u1', 'user', 'My name is EarlyBird.'),
      ...Array.from({ length: 14 }, (_, i) =>
        makeMessage(`u${i + 2}`, 'user', 'Just chatting.'),
      ),
    ];
    const facts = extractWorkingMemoryFacts(messages);
    const nameFact = facts.find(
      (f) => f.category === 'name' && f.text.toLowerCase().includes('earlybird'),
    );
    // EarlyBird is in message 1 out of 15, which is outside the default 10-message window.
    expect(nameFact).toBeUndefined();
  });

  it('each returned fact carries the correct sourceMessageId', () => {
    const messages = [makeMessage('msg-42', 'user', 'My name is Riley.')];
    const facts = extractWorkingMemoryFacts(messages);

    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.sourceMessageId).toBe('msg-42');
    }
  });

  it('each returned fact has a non-empty text and a valid category', () => {
    const VALID_CATEGORIES: WorkingMemoryFact['category'][] = [
      'name',
      'preference',
      'fact',
      'emotion',
      'plan',
      'reference',
    ];

    const messages = [
      makeMessage('u1', 'user', "My name is Taylor. I love sushi. I'm a designer. I feel happy today."),
    ];
    const facts = extractWorkingMemoryFacts(messages);

    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.text.length).toBeGreaterThan(0);
      expect(VALID_CATEGORIES).toContain(fact.category);
      expect(fact.extractedAt).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildWorkingMemoryBlock
// ---------------------------------------------------------------------------

describe('buildWorkingMemoryBlock', () => {
  it('returns an empty string when given an empty array', () => {
    expect(buildWorkingMemoryBlock([])).toBe('');
  });

  it('returns a non-empty string when given at least one fact', () => {
    const facts: WorkingMemoryFact[] = [
      {
        text: "User's name is Alex",
        sourceMessageId: 'u1',
        extractedAt: 1_000,
        category: 'name',
      },
    ];
    expect(buildWorkingMemoryBlock(facts).length).toBeGreaterThan(0);
  });

  it('formats each fact with its category label', () => {
    const facts: WorkingMemoryFact[] = [
      {
        text: "User's name is Alex",
        sourceMessageId: 'u1',
        extractedAt: 1_000,
        category: 'name',
      },
      {
        text: 'User enjoys hiking',
        sourceMessageId: 'u2',
        extractedAt: 1_000,
        category: 'preference',
      },
      {
        text: 'User is a nurse',
        sourceMessageId: 'u3',
        extractedAt: 1_000,
        category: 'fact',
      },
      {
        text: 'User is feeling stressed',
        sourceMessageId: 'u4',
        extractedAt: 1_000,
        category: 'emotion',
      },
    ];
    const block = buildWorkingMemoryBlock(facts);

    expect(block).toContain('Name');
    expect(block).toContain('Preference');
    expect(block).toContain('Fact');
    expect(block).toContain('Emotion');
  });

  it('includes the fact text in the output', () => {
    const facts: WorkingMemoryFact[] = [
      {
        text: "User's name is Jordan",
        sourceMessageId: 'u1',
        extractedAt: 1_000,
        category: 'name',
      },
    ];
    const block = buildWorkingMemoryBlock(facts);
    expect(block).toContain("User's name is Jordan");
  });

  it('includes all facts when multiple are provided', () => {
    const texts = ['User enjoys sushi', 'User is 28 years old', 'User feels hopeful'];
    const facts: WorkingMemoryFact[] = texts.map((text, i) => ({
      text,
      sourceMessageId: `u${i}`,
      extractedAt: 1_000,
      category: 'preference' as const,
    }));
    const block = buildWorkingMemoryBlock(facts);

    for (const text of texts) {
      expect(block).toContain(text);
    }
  });

  it('produces a multi-line string when multiple facts are given', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'Fact one', sourceMessageId: 'u1', extractedAt: 1_000, category: 'name' },
      { text: 'Fact two', sourceMessageId: 'u2', extractedAt: 1_000, category: 'fact' },
    ];
    const block = buildWorkingMemoryBlock(facts);
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('formats plan and reference categories without crashing', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'User plans to visit Tokyo', sourceMessageId: 'u1', extractedAt: 1_000, category: 'plan' },
      { text: 'User referenced an earlier topic', sourceMessageId: 'u2', extractedAt: 1_000, category: 'reference' },
    ];
    const block = buildWorkingMemoryBlock(facts);
    expect(block).toContain('Plan');
    expect(block).toContain('Reference');
  });
});

// ---------------------------------------------------------------------------
// deduplicateWithLongTerm
// ---------------------------------------------------------------------------

describe('deduplicateWithLongTerm', () => {
  it('returns all facts when long-term memories array is empty', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'User enjoys hiking', sourceMessageId: 'u1', extractedAt: 1_000, category: 'preference' },
      { text: "User's name is Sam", sourceMessageId: 'u2', extractedAt: 1_000, category: 'name' },
    ];
    expect(deduplicateWithLongTerm(facts, [])).toHaveLength(2);
  });

  it('removes a working fact that is an exact substring match of a long-term memory', () => {
    const workingFact: WorkingMemoryFact = {
      text: 'User enjoys hiking',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'preference',
    };
    const longTerm = [makeMemoryRecord('m1', 'Enjoys hiking on mountain trails every weekend')];

    const result = deduplicateWithLongTerm([workingFact], longTerm);
    // "hiking" is a high-overlap token — the service should filter this out.
    expect(result).toHaveLength(0);
  });

  it('keeps a fact that is genuinely new and shares no tokens with existing memories', () => {
    const workingFact: WorkingMemoryFact = {
      text: 'User is 28 years old',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'fact',
    };
    const longTerm = [makeMemoryRecord('m1', 'Enjoys hiking')];

    const result = deduplicateWithLongTerm([workingFact], longTerm);
    expect(result).toHaveLength(1);
  });

  it('keeps facts that only partially overlap with long-term memories', () => {
    // "User loves sushi" vs "User enjoys cooking" — "user" is filtered as a 4-char
    // token, so the overlap is minimal and the fact should survive.
    const workingFact: WorkingMemoryFact = {
      text: 'User loves sushi',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'preference',
    };
    const longTerm = [makeMemoryRecord('m1', 'User enjoys cooking at home')];

    // "user" is 4 chars so kept. But "loves" and "sushi" don't overlap with
    // "enjoys", "cooking", "home". Overlap / factTokens should be ≤ 0.5.
    const result = deduplicateWithLongTerm([workingFact], longTerm);
    expect(result).toHaveLength(1);
  });

  it('removes duplicates when a single long-term record covers more than half the fact tokens', () => {
    // "User enjoys hiking trails" → tokens: ["user", "enjoys", "hiking", "trails"] (4 tokens).
    // A long-term record "User enjoys hiking on trails" → tokens include "user", "enjoys",
    // "hiking", "trails" — overlap = 4/4 = 1.0 > 0.5, so it gets filtered.
    const workingFact: WorkingMemoryFact = {
      text: 'User enjoys hiking trails',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'preference',
    };
    const longTerm = [makeMemoryRecord('m1', 'User enjoys hiking on trails regularly')];

    const result = deduplicateWithLongTerm([workingFact], longTerm);
    expect(result).toHaveLength(0);
  });

  it('keeps a fact when token overlap with any single record is exactly 50% (boundary: strict > 0.5)', () => {
    // "User enjoys hiking trails" → 4 tokens: ["user", "enjoys", "hiking", "trails"].
    // "Enjoys hiking" → tokens: ["enjoys", "hiking"].  Overlap = 2.  2/4 = 0.5 is NOT > 0.5.
    // The implementation uses strict greater-than, so exactly 50 % overlap keeps the fact.
    const workingFact: WorkingMemoryFact = {
      text: 'User enjoys hiking trails',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'preference',
    };
    const longTerm = [makeMemoryRecord('m1', 'Enjoys hiking')];

    const result = deduplicateWithLongTerm([workingFact], longTerm);
    // 50 % overlap does NOT exceed the > 0.5 threshold — fact survives.
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when all working facts are duplicates', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'User enjoys hiking', sourceMessageId: 'u1', extractedAt: 1_000, category: 'preference' },
      { text: "User's name is Alex", sourceMessageId: 'u2', extractedAt: 1_000, category: 'name' },
    ];
    const longTerm = [
      makeMemoryRecord('m1', 'User enjoys hiking on trails'),
      makeMemoryRecord('m2', "User's name is Alex Johnson"),
    ];

    const result = deduplicateWithLongTerm(facts, longTerm);
    expect(result).toHaveLength(0);
  });

  it('preserves facts that are new even when some are duplicates', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'User enjoys hiking', sourceMessageId: 'u1', extractedAt: 1_000, category: 'preference' },
      { text: 'User is a software engineer', sourceMessageId: 'u2', extractedAt: 1_000, category: 'fact' },
    ];
    const longTerm = [makeMemoryRecord('m1', 'User enjoys hiking in the mountains')];

    const result = deduplicateWithLongTerm(facts, longTerm);
    // Only the engineer fact is new.
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toContain('engineer');
  });

  it('treats comparison as case-insensitive', () => {
    const workingFact: WorkingMemoryFact = {
      text: 'User enjoys HIKING',
      sourceMessageId: 'u1',
      extractedAt: 1_000,
      category: 'preference',
    };
    const longTerm = [makeMemoryRecord('m1', 'enjoys hiking every weekend')];

    const result = deduplicateWithLongTerm([workingFact], longTerm);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input arrays', () => {
    const facts: WorkingMemoryFact[] = [
      { text: 'User enjoys hiking', sourceMessageId: 'u1', extractedAt: 1_000, category: 'preference' },
    ];
    const longTerm = [makeMemoryRecord('m1', 'Unrelated memory')];

    const originalFactsLength = facts.length;
    const originalLongTermLength = longTerm.length;

    deduplicateWithLongTerm(facts, longTerm);

    expect(facts).toHaveLength(originalFactsLength);
    expect(longTerm).toHaveLength(originalLongTermLength);
  });
});
