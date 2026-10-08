import { describe, it, expect } from 'vitest';
import { parseSegments } from '../lib/parseSegments';

describe('parseSegments', () => {
  it('treats unmarked text as speech', () => {
    expect(parseSegments('Hi there')).toEqual([{ kind: 'speech', text: 'Hi there' }]);
  });

  it('parses explicit short tags', () => {
    expect(parseSegments('[a]I sit down on the couch[/a] Hi Rin!')).toEqual([
      { kind: 'action', text: 'I sit down on the couch' },
      { kind: 'speech', text: 'Hi Rin!' },
    ]);
  });

  it('parses all four explicit tags in order', () => {
    const out = parseSegments('[n]Rain falls.[/n][a]She smiles.[/a]Hello![t]He came.[/t][m]likes rain[/m]');
    expect(out.map((s) => s.kind)).toEqual(['narration', 'action', 'speech', 'thought', 'memory']);
  });

  it('is case-insensitive for tags', () => {
    expect(parseSegments('[A]waves[/A]')).toEqual([{ kind: 'action', text: 'waves' }]);
  });

  it('keeps legacy *italic* as action and (parens) as narration', () => {
    expect(parseSegments('*smiles* Hello (the rain keeps falling)')).toEqual([
      { kind: 'action', text: 'smiles' },
      { kind: 'speech', text: 'Hello' },
      { kind: 'narration', text: 'the rain keeps falling' },
    ]);
  });

  it('leaves short parentheses and bold inside speech', () => {
    expect(parseSegments('ok (hi) **really**')).toEqual([{ kind: 'speech', text: 'ok (hi) **really**' }]);
  });

  it('turns a leaked [Memory] line prefix into a memory segment, never literal text', () => {
    expect(parseSegments('[Memory] Rainy days are perfect for a good book')).toEqual([
      { kind: 'memory', text: 'Rainy days are perfect for a good book' },
    ]);
  });

  it('collapses stacked [Memory] labels', () => {
    expect(parseSegments('[Memory] [Memory] hi')).toEqual([{ kind: 'memory', text: 'hi' }]);
  });

  it('does not tokenise inside fenced or inline code', () => {
    const src = 'Try this:\n```js\nconst a = "*x* [a]no[/a]";\n```\nand `*y*` too';
    const out = parseSegments(src);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('speech');
    expect(out[0].text).toContain('[a]no[/a]');
    expect(out[0].text).toContain('`*y*`');
  });

  it('leaves an unclosed tag as literal speech text', () => {
    expect(parseSegments('[a]never closed')).toEqual([{ kind: 'speech', text: '[a]never closed' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseSegments('')).toEqual([]);
    expect(parseSegments('   ')).toEqual([]);
  });

  it('explicit tag wins over legacy markers inside it', () => {
    expect(parseSegments('[a]*waves* hello[/a]')).toEqual([{ kind: 'action', text: '*waves* hello' }]);
  });
});
