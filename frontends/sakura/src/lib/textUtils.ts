/**
 * Strips LLM annotation brackets from message text.
 *
 * The backend's `_parse_emotion_gesture()` strips these before DB storage
 * for new messages, but old DB records may still contain them. Apply at
 * render time and on any user-visible text export.
 *
 * @param text - Raw message text, possibly containing annotation brackets.
 * @returns Text with all known bracket annotation patterns removed.
 *
 * @example
 * stripAnnotations('[emotional expression: soft smile] Hello!')
 * // → 'Hello!'
 */
export function stripAnnotations(text: string): string {
  return text
    .replace(/\[emotional expression:[^\]]*\]/gi, '')
    .replace(/\[gesture:[^\]]*\]/gi, '')
    .replace(/\[action:[^\]]*\]/gi, '')
    .replace(/\[mood:[^\]]*\]/gi, '')
    .replace(/\[facial:[^\]]*\]/gi, '')
    .replace(/\[emotion:[^\]]*\]/gi, '')
    .trim();
}
