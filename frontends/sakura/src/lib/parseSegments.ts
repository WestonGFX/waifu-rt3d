/**
 * Script-style segment parser for chat messages.
 *
 * A message is read like a script: spoken lines, actions, scene narration,
 * thoughts and recalled memories. Unmarked text is speech.
 *
 * Syntax (case-insensitive):
 * - `[a]…[/a]` action · `[n]…[/n]` narration · `[t]…[/t]` thought · `[m]…[/m]` memory
 * - Legacy shorthand still works: `*action*` and `(narration, 4+ chars)`
 * - A leaked `[Memory] …` line prefix (an internal prompt label some small models
 *   copy into replies) becomes a memory segment instead of showing as literal text.
 * - Fenced code, inline `code` and `**bold**` pass through untouched inside speech.
 * - An unclosed tag stays literal text — nothing is ever swallowed.
 *
 * Pure function, no React/DOM dependencies.
 */

export type SegmentKind = 'speech' | 'action' | 'narration' | 'thought' | 'memory';

export interface Segment {
  kind: SegmentKind;
  text: string;
}

const TAG_KIND: Record<string, SegmentKind> = {
  a: 'action',
  n: 'narration',
  t: 'thought',
  m: 'memory',
};

// Alternation order matters: opaque code first, then leaked label, explicit tags,
// bold (so its `*` is not read as italic), then legacy italic / parentheses.
const SEGMENT_RE = new RegExp(
  [
    '(```[\\s\\S]*?```)', // 1 fenced code (opaque)
    '(`[^`\\n]+`)', // 2 inline code (opaque)
    '^[ \\t]*(?:\\[memory\\][ \\t]*)+([^\\n]*)', // 3 leaked [Memory] label line
    '\\[([antm])\\]([\\s\\S]*?)\\[\\/\\4\\]', // 4,5 explicit tag
    '(\\*\\*.+?\\*\\*)', // 6 bold (opaque)
    '\\*([^*\\n]+)\\*', // 7 legacy italic -> action
    '\\(([^)]{4,})\\)', // 8 legacy parens -> narration
  ].join('|'),
  'gim',
);

/**
 * Split a message into ordered script segments.
 *
 * @param text Raw message text. May be empty.
 * @returns Segments in reading order; adjacent speech is merged and
 *   empty segments are dropped. `[]` for empty/whitespace input.
 *
 * @example
 *   parseSegments('*smiles* Hello!')
 *   // → [{ kind: 'action', text: 'smiles' }, { kind: 'speech', text: 'Hello!' }]
 */
export function parseSegments(text: string): Segment[] {
  if (!text || !text.trim()) return [];

  const out: Segment[] = [];
  const push = (kind: SegmentKind, raw: string) => {
    const t = kind === 'speech' ? raw : raw.trim();
    if (!t.trim()) return;
    const last = out[out.length - 1];
    if (kind === 'speech' && last?.kind === 'speech') last.text += t;
    else out.push({ kind, text: t });
  };

  let cursor = 0;
  for (const m of text.matchAll(SEGMENT_RE)) {
    const idx = m.index ?? 0;
    push('speech', text.slice(cursor, idx));
    cursor = idx + m[0].length;

    if (m[1] !== undefined || m[2] !== undefined || m[6] !== undefined) push('speech', m[0]);
    else if (m[3] !== undefined) push('memory', m[3]);
    else if (m[4] !== undefined) push(TAG_KIND[m[4].toLowerCase()], m[5] ?? '');
    else if (m[7] !== undefined) push('action', m[7]);
    else if (m[8] !== undefined) push('narration', m[8]);
  }
  push('speech', text.slice(cursor));

  // Speech keeps its internal spacing while merging; trim only the segment edges.
  return out.map((s) => (s.kind === 'speech' ? { ...s, text: s.text.trim() } : s)).filter((s) => s.text);
}
