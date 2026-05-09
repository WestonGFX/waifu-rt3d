/**
 * Markdown-flavoured token parser for chat message rendering.
 *
 * Supports six token types:
 * - `**bold**`  → bold token (parsed first to avoid collision with italic)
 * - `*italic*` → italic / "action" token (rendered with accent color)
 * - `(narration)` → narration token (4+ chars inside parens)
 * - fenced code blocks (``` lang\n…\n ```) → code token with lang + body
 * - inline backtick code (`snippet`) → inline_code token
 * - plain text everywhere else
 *
 * Used by both user and assistant message renderers so that asterisk-wrapped
 * roleplay actions (`*i hold sakura's hand*`) render with consistent
 * italic+accent styling in both directions.
 *
 * Pure function, no React/DOM dependencies — Vitest-friendly.
 */

export type TokenType = 'plain' | 'bold' | 'italic' | 'narration' | 'code' | 'inline_code';

export interface Token {
  type: TokenType;
  text: string;
  /** Language hint for fenced code blocks (e.g. "python", "ts"). Empty string if none. */
  lang?: string;
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

// Matches fenced code blocks: ```lang\nbody\n``` (multiline, non-greedy body)
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
// Matches inline backtick code: `snippet` (single backtick, no newline inside)
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * Full-featured tokeniser extending `parseActions` with fenced code blocks
 * and inline backtick code support. Handles fences first (before inline pass)
 * so triple-backtick regions are never mis-tokenised as italic asterisks.
 *
 * Returns a flat token array covering the entire input. Code block tokens have
 * `type: 'code'` with a `lang` field; inline code tokens have `type: 'inline_code'`
 * with `text` set to the content (backticks stripped).
 *
 * @param text Source string.
 * @returns Ordered flat array of tokens.
 *
 * @example
 *   parseFull('See:\n```python\nprint("hi")\n```')
 *   // → [
 *   //     { type: 'plain', text: 'See:\n' },
 *   //     { type: 'code', lang: 'python', text: 'print("hi")\n' },
 *   //   ]
 */
export function parseFull(text: string): Token[] {
  if (!text) return [];

  const result: Token[] = [];
  const fenceRe = new RegExp(FENCE_RE.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Pass 1: split on fenced code blocks
  while ((match = fenceRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      // Pass 2 for non-fence segment: inline code + inline markdown
      result.push(...parseInlineWithCode(before));
    }
    result.push({ type: 'code', lang: match[1].trim(), text: match[2] });
    lastIndex = fenceRe.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (tail) {
    result.push(...parseInlineWithCode(tail));
  }

  return result;
}

/**
 * Tokenise a non-fence text segment for inline code and then regular markdown.
 * Inline backtick code (`…`) takes precedence over bold/italic.
 */
function parseInlineWithCode(text: string): Token[] {
  const result: Token[] = [];
  const inlineRe = new RegExp(INLINE_CODE_RE.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) result.push(...parseActions(before));
    result.push({ type: 'inline_code', text: match[1] });
    lastIndex = inlineRe.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (tail) result.push(...parseActions(tail));

  return result;
}
