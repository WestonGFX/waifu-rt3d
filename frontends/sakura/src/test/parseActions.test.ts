import { describe, it, expect } from 'vitest';
import { parseActions, stripActionMarkup } from '../lib/parseActions';

describe('parseActions', () => {
  it('returns empty array for empty string', () => {
    expect(parseActions('')).toEqual([]);
  });

  it('returns single plain token when no markup present', () => {
    expect(parseActions('hello world')).toEqual([
      { type: 'plain', text: 'hello world' },
    ]);
  });

  it('parses single italic action', () => {
    expect(parseActions('*smiles*')).toEqual([
      { type: 'italic', text: 'smiles' },
    ]);
  });

  it('parses italic action surrounded by plain text', () => {
    expect(parseActions('hi *waves* there')).toEqual([
      { type: 'plain', text: 'hi ' },
      { type: 'italic', text: 'waves' },
      { type: 'plain', text: ' there' },
    ]);
  });

  it('parses multiple italic actions in one string', () => {
    expect(parseActions('*nods* and *smiles*')).toEqual([
      { type: 'italic', text: 'nods' },
      { type: 'plain', text: ' and ' },
      { type: 'italic', text: 'smiles' },
    ]);
  });

  it('parses bold separately from italic', () => {
    expect(parseActions('this is **bold** vs *italic*')).toEqual([
      { type: 'plain', text: 'this is ' },
      { type: 'bold', text: 'bold' },
      { type: 'plain', text: ' vs ' },
      { type: 'italic', text: 'italic' },
    ]);
  });

  it('does not match bold as two italic tokens', () => {
    // **word** must NOT split into [italic '', plain 'word', italic '']
    const tokens = parseActions('**word**');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: 'bold', text: 'word' });
  });

  it('parses parenthetical narration with 4+ chars', () => {
    expect(parseActions('she said (looking down)')).toEqual([
      { type: 'plain', text: 'she said ' },
      { type: 'narration', text: 'looking down' },
    ]);
  });

  it('does not treat short parens as narration', () => {
    // (lol) is only 3 chars inside, must stay plain
    expect(parseActions('haha (lol) okay')).toEqual([
      { type: 'plain', text: 'haha (lol) okay' },
    ]);
  });

  it('does not match italic across newlines', () => {
    // Single * across a newline should NOT be treated as italic
    expect(parseActions('plain *open\nclose* text')).toEqual([
      { type: 'plain', text: 'plain *open\nclose* text' },
    ]);
  });

  it('mixes bold, italic, and plain in expected order', () => {
    expect(parseActions('a **b** c *d* e')).toEqual([
      { type: 'plain', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'plain', text: ' c ' },
      { type: 'italic', text: 'd' },
      { type: 'plain', text: ' e' },
    ]);
  });

  it('handles unclosed asterisk as plain text', () => {
    // Trailing single asterisk with no close — never matches the italic alternation
    expect(parseActions('hello *world')).toEqual([
      { type: 'plain', text: 'hello *world' },
    ]);
  });

  it('preserves leading and trailing whitespace in plain segments', () => {
    expect(parseActions('  *act*  ')).toEqual([
      { type: 'plain', text: '  ' },
      { type: 'italic', text: 'act' },
      { type: 'plain', text: '  ' },
    ]);
  });
});

describe('stripActionMarkup', () => {
  it('removes asterisks from italic actions', () => {
    expect(stripActionMarkup('hi *waves* there')).toBe('hi waves there');
  });

  it('removes double-asterisks from bold', () => {
    expect(stripActionMarkup('this is **bold** text')).toBe('this is bold text');
  });

  it('removes parens from narration', () => {
    expect(stripActionMarkup('she said (looking down)')).toBe('she said looking down');
  });

  it('returns plain text unchanged', () => {
    expect(stripActionMarkup('plain text')).toBe('plain text');
  });

  it('returns empty string for empty input', () => {
    expect(stripActionMarkup('')).toBe('');
  });
});
