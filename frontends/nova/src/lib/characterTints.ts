/**
 * Per-character CSS variable mappings for glass tinting.
 *
 * When the active character changes, the app injects CSS custom properties
 * onto `document.documentElement` that shift ambient orb colors and glass
 * border tints. Each character gets a deterministic hue derived from their
 * name (via a simple hash), ensuring consistent coloring across sessions.
 *
 * Variables injected:
 *   --tint-hue      : 0-360 hue for accent color calculations
 *   --tint-accent   : hsla() string for accent highlights
 *   --tint-ambient  : hsla() string for ambient orb overlay
 *
 * @example
 * ```ts
 * applyCharacterTint('Yuki');  // injects warm pink tints
 * applyCharacterTint(null);    // resets to default
 * ```
 */

/** Emotion-to-color mapping for the EmotionOrb gradient. */
export const EMOTION_COLORS: Record<string, { primary: string; secondary: string; glow: string }> = {
  happy:     { primary: '#ffdb70', secondary: '#ff9a76', glow: 'rgba(255, 219, 112, 0.3)' },
  excited:   { primary: '#ff6b6b', secondary: '#ffa502', glow: 'rgba(255, 107, 107, 0.35)' },
  playful:   { primary: '#ff78c4', secondary: '#ff9a76', glow: 'rgba(255, 120, 196, 0.3)' },
  flirty:    { primary: '#ff78c4', secondary: '#b49bf0', glow: 'rgba(255, 120, 196, 0.3)' },
  love:      { primary: '#ff4d6d', secondary: '#ff78c4', glow: 'rgba(255, 77, 109, 0.35)' },
  sad:       { primary: '#74b9ff', secondary: '#a29bfe', glow: 'rgba(116, 185, 255, 0.25)' },
  angry:     { primary: '#ff4444', secondary: '#ff6b35', glow: 'rgba(255, 68, 68, 0.35)' },
  annoyed:   { primary: '#ff7675', secondary: '#fd9644', glow: 'rgba(255, 118, 117, 0.25)' },
  surprised: { primary: '#fdcb6e', secondary: '#e17055', glow: 'rgba(253, 203, 110, 0.3)' },
  confused:  { primary: '#a29bfe', secondary: '#74b9ff', glow: 'rgba(162, 155, 254, 0.25)' },
  shy:       { primary: '#ffb8c6', secondary: '#dda0dd', glow: 'rgba(255, 184, 198, 0.25)' },
  nervous:   { primary: '#dfe6e9', secondary: '#b2bec3', glow: 'rgba(223, 230, 233, 0.2)' },
  calm:      { primary: '#81ecec', secondary: '#a29bfe', glow: 'rgba(129, 236, 236, 0.2)' },
  neutral:   { primary: '#b49bf0', secondary: '#ffb9aa', glow: 'rgba(180, 155, 240, 0.15)' },
};

/** Default emotion colors when the emotion string isn't in our map. */
const DEFAULT_EMOTION = EMOTION_COLORS.neutral;

/**
 * Look up the gradient colors for a given emotion.
 *
 * @param emotion - Emotion name from the LLM (e.g. "happy", "sad").
 * @returns Color set with primary, secondary, and glow values.
 */
export function getEmotionColors(emotion: string | null): typeof DEFAULT_EMOTION {
  if (!emotion) return DEFAULT_EMOTION;
  return EMOTION_COLORS[emotion.toLowerCase()] ?? DEFAULT_EMOTION;
}

/**
 * Compute a deterministic hue (0–360) from a character name.
 * Uses a simple string hash to ensure the same name always produces
 * the same hue, creating visual consistency across sessions.
 *
 * @param name - Character display name.
 * @returns Hue value between 0 and 360.
 */
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash) % 360;
}

/**
 * Apply character-specific tint CSS variables to the document root.
 * Triggers a smooth 2-second transition on the ambient layer because
 * the orb colors reference `--tint-*` variables.
 *
 * @param characterName - Name of the active character, or null to reset.
 */
export function applyCharacterTint(characterName: string | null): void {
  const root = document.documentElement;

  if (!characterName) {
    root.style.removeProperty('--tint-hue');
    root.style.removeProperty('--tint-accent');
    root.style.removeProperty('--tint-ambient');
    return;
  }

  const hue = nameToHue(characterName);
  root.style.setProperty('--tint-hue', String(hue));
  root.style.setProperty('--tint-accent', `hsla(${hue}, 70%, 75%, 0.6)`);
  root.style.setProperty('--tint-ambient', `hsla(${hue}, 50%, 60%, 0.08)`);
}
