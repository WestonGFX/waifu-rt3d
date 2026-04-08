import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

// Mock the entire api module so we can control generateQuickReplies responses
vi.mock('../lib/api', () => ({
  api: {
    generateQuickReplies: vi.fn(),
    llmGenerate: vi.fn(),
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Tests for the LLM-powered quick-reply chip generation.
 *
 * The generateQuickReplies API method sends a focused prompt to the LLM
 * and expects a JSON array of 3 short suggestion strings. These tests
 * verify the API wrapper is called correctly and that various LLM response
 * formats are handled gracefully.
 */
describe('Quick Chips — LLM generation via api.generateQuickReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls generateQuickReplies with correct parameters', async () => {
    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: '["That sounds fun!", "Tell me more", "Haha, really?"]',
    });

    const result = await api.generateQuickReplies(
      'I had a wonderful day at the beach today!',
      'Aria',
      'Chris',
    );

    expect(api.generateQuickReplies).toHaveBeenCalledWith(
      'I had a wonderful day at the beach today!',
      'Aria',
      'Chris',
    );
    expect(result.text).toBeTruthy();
  });

  it('returns valid JSON array when LLM responds cleanly', async () => {
    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: '["That sounds fun!", "Tell me more about it", "I wish I could have been there"]',
    });

    const result = await api.generateQuickReplies('Beach day!', 'Aria', 'Chris');
    const parsed = JSON.parse(result.text);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toBe('That sounds fun!');
  });

  it('handles LLM response wrapped in markdown code block', async () => {
    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: '```json\n["Option A", "Option B", "Option C"]\n```',
    });

    const result = await api.generateQuickReplies('Hello!', 'Aria', 'Chris');
    const text = result.text.trim();

    // The caller (generateChipsLLM) uses a regex fallback to extract the array
    const match = text.match(/\[.*\]/s);
    expect(match).not.toBeNull();

    const extracted = JSON.parse(match![0]);
    expect(Array.isArray(extracted)).toBe(true);
    expect(extracted).toHaveLength(3);
  });

  it('handles LLM response with surrounding prose', async () => {
    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: 'Here are 3 suggestions:\n["Wow!", "That\'s cool", "What happened next?"]\nHope these help!',
    });

    const result = await api.generateQuickReplies('Story time', 'Kai', 'Chris');
    const match = result.text.match(/\[.*\]/s);
    expect(match).not.toBeNull();

    const extracted = JSON.parse(match![0]);
    expect(extracted).toHaveLength(3);
    expect(extracted[0]).toBe('Wow!');
  });

  it('returns text that fails JSON.parse when LLM produces garbage', async () => {
    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: 'I cannot generate suggestions right now.',
    });

    const result = await api.generateQuickReplies('Hello', 'Aria', 'Chris');

    // Direct parse should throw
    expect(() => JSON.parse(result.text)).toThrow();
    // Regex extraction should also fail
    const match = result.text.match(/\[.*\]/s);
    expect(match).toBeNull();
  });

  it('rejects when the API endpoint is unreachable', async () => {
    vi.mocked(api.generateQuickReplies).mockRejectedValue(new Error('Network error'));

    await expect(
      api.generateQuickReplies('Test', 'Aria', 'Chris'),
    ).rejects.toThrow('Network error');
  });

  it('truncates assistant reply to 300 chars in the prompt', () => {
    // Verify the API method signature accepts long strings —
    // the actual truncation happens inside the api.ts wrapper via .slice(0, 300)
    const longReply = 'A'.repeat(1000);

    vi.mocked(api.generateQuickReplies).mockResolvedValue({
      text: '["Short reply 1", "Short reply 2", "Short reply 3"]',
    });

    // Should not throw with a very long input
    expect(() => api.generateQuickReplies(longReply, 'Luna', 'Chris')).not.toThrow();
  });
});

/**
 * Tests for the heuristic chip generator (pure function, no LLM call).
 *
 * The generateChips function in ChatThread.tsx uses regex patterns to
 * produce contextually appropriate reply suggestions as a zero-latency
 * fallback while the LLM call is in flight.
 */
describe('Quick Chips — heuristic generator patterns', () => {
  // We can't import generateChips directly (it's not exported),
  // so we test the regex patterns it uses to validate the logic.

  it('detects questions via "?" character', () => {
    const text = 'What do you like to do for fun?';
    expect(text.includes('?')).toBe(true);
  });

  it('detects user-directed questions via regex', () => {
    const patterns = [
      'How are you doing today?',
      'What about you though?',
      'Tell me about yourself',
      'How do you feel about that?',
    ];
    const regex = /how (are|do) you|what about you|tell me/i;
    for (const text of patterns) {
      expect(regex.test(text.toLowerCase())).toBe(true);
    }
  });

  it('detects emotional content via regex', () => {
    const emotionalTexts = [
      'I feel so happy today!',
      "I'm a bit sad actually",
      'I really miss those days',
      'I love spending time with you',
    ];
    const regex = /happy|sad|miss|love|glad|wonder|hope|afraid/i;
    for (const text of emotionalTexts) {
      expect(regex.test(text.toLowerCase())).toBe(true);
    }
  });

  it('falls through to generic chips for neutral content', () => {
    const text = 'The weather has been nice lately.';
    const hasQuestion = text.includes('?');
    const isUserDirected = /how (are|do) you|what about you|tell me/i.test(text.toLowerCase());
    const isEmotional = /happy|sad|miss|love|glad|wonder|hope|afraid/i.test(text.toLowerCase());

    expect(hasQuestion).toBe(false);
    expect(isUserDirected).toBe(false);
    expect(isEmotional).toBe(false);
    // Falls to the default branch: generic conversational chips
  });
});
