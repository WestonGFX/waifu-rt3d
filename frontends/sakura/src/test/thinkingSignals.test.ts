import { describe, it, expect } from 'vitest';
import { soundsLikeAssistant, thinkingPreview } from '../lib/thinkingSignals';

describe('soundsLikeAssistant', () => {
  it('flags the classic assistant scratchpad', () => {
    expect(soundsLikeAssistant('Thinking Process:\n\n1. Analyze the Request:\n   * Persona: Rin')).toBe(true);
  });
  it('flags "the user wants" style task analysis', () => {
    expect(soundsLikeAssistant('The user wants a short reply. Constraints: 1-2 sentences.')).toBe(true);
  });
  it('does not flag in-character thought', () => {
    expect(soundsLikeAssistant('He kept the window seat for me. I should smile and not blush.')).toBe(false);
  });
  it('is safe on empty input', () => {
    expect(soundsLikeAssistant('')).toBe(false);
    expect(soundsLikeAssistant(undefined)).toBe(false);
  });
});

describe('thinkingPreview', () => {
  it('skips the header and list markers', () => {
    expect(thinkingPreview('Thinking Process:\n\n1.  **Analyze the Request:**\n   * Persona: Rin')).toBe('Analyze the Request:');
  });
  it('truncates long lines with an ellipsis', () => {
    expect(thinkingPreview('x'.repeat(200), 20)).toBe('x'.repeat(19) + '…');
  });
  it('returns empty for nothing', () => {
    expect(thinkingPreview(null)).toBe('');
  });
});
