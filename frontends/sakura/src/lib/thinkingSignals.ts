/**
 * Cheap checks on a model's saved thinking.
 *
 * A companion model should think *as the character*. When the reasoning reads like a
 * generic assistant working through a task ("Thinking Process: 1. Analyze the Request"),
 * the prompt or the model is not holding the role-play. The chat shows a quiet notice;
 * the same signal can be aggregated per model later.
 *
 * Heuristic on purpose — no network, no model. False positives are cheap (a small notice).
 */

const ASSISTANT_PATTERNS: RegExp[] = [
  /^\s*thinking process:/i,
  /\banalyze the request\b/i,
  /\bthe user (?:is|wants|asks|asked|said|has)\b/i,
  /^\s*\d+\.\s+\*{0,2}(?:analy[sz]e|determine|draft|check|identify|review|constraints?)\b/im,
  /\bconstraints?:/i,
];

/**
 * @param thinking The model's reasoning text.
 * @returns true when it reads like a generic assistant instead of the character.
 *
 * @example
 *   soundsLikeAssistant('Thinking Process:\n1. Analyze the Request') // true
 *   soundsLikeAssistant('He kept the window seat for me... I should smile.') // false
 */
export function soundsLikeAssistant(thinking: string | undefined | null): boolean {
  if (!thinking) return false;
  let hits = 0;
  for (const re of ASSISTANT_PATTERNS) if (re.test(thinking)) hits++;
  return hits >= 2 || /^\s*thinking process:/i.test(thinking);
}

/** First meaningful line of the thinking, trimmed for the one-line peek view. */
export function thinkingPreview(thinking: string | undefined | null, max = 110): string {
  if (!thinking) return '';
  const line = thinking
    .split('\n')
    .map((l) => l.replace(/^[\s*#\-\d.]+/, '').replace(/\*\*/g, '').trim())
    .find((l) => l && !/^thinking process:?$/i.test(l)) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
