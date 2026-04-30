/**
 * Markdown-flavoured token parser for chat message rendering.
 *
 * Supports four token types:
 * - `**bold**`  → bold token (parsed first to avoid collision with italic)
 * - `*italic*` → italic / "action" token (rendered with accent color)
 * - `(narration)` → narration token (4+ chars inside parens)
 * - plain text everywhere else
 *
 * Used by both user and assistant message renderers so that asterisk-wrapped
 * roleplay actions (`*i hold sakura's hand*`) render with consistent
 * italic+accent styling in both directions.
 *
 * Pure function, no React/DOM dependencies — Vitest-friendly.
 */

export type TokenType = 'plain' | 'bold' | 'italic' | 'narration';

export interface Token {
  type: TokenType;
  text: string;
}

const TOKEN_RE = /\*\*(.+?)\*\*|\*([^*\n]+)\*|\(([^)]{4,})\)/g;

/**
 * Tokenise a string into typed segments for rich rendering.
 *
 * @param text Source string. May be empty.
 * @returns Ordered array of tokens covering the entire input. Concatenating
 *   `tokens.map(t => t.text).join('')` is NOT guaranteed to equal `text`
 *   exactly (the wrapping `*` / `**` / `()` characters are stripped from the
 *   matched tokens) — but the visible reading order is preserved.
 *
 * @example
 *   parseActions('hello *world*')
 *   // → [{ type: 'plain', text: 'hello ' }, { type: 'italic', text: 'world' }]
 *
 * @example
 *   parseActions('**bold** then *italic* then (narration here)')
 *   // → [
 *   //     { type: 'bold', text: 'bold' },
 *   //     { type: 'plain', text: ' then ' },
 *   //     { type: 'italic', text: 'italic' },
 *   //     { type: 'plain', text: ' then ' },
 *   //     { type: 'narration', text: 'narration here' },
 *   //   ]
 */
export function parseActions(text: string): Token[] {
  const tokens: Token[] = [];
  if (!text) return tokens;

  const re = new RegExp(TOKEN_RE.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'plain', text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) tokens.push({ type: 'bold', text: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: 'italic', text: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: 'narration', text: match[3] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'plain', text: text.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Strip markup wrappers, leaving the inner text. Useful for TTS preprocessing
 * so the speech engine doesn't read asterisks aloud.
 *
 * @param text Source string.
 * @returns Same string with `**`, `*`, and narration parens removed.
 */
export function stripActionMarkup(text: string): string {
  return parseActions(text)
    .map(t => t.text)
    .join('');
}
