import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useViewerStore } from '../stores/viewerStore';

/**
 * Emotion groups — transitions between different groups trigger a new background.
 * Transitions within the same group (e.g., happy→excited) are skipped.
 */
const EMOTION_GROUPS: Record<string, string> = {
  happy: 'positive',
  excited: 'positive',
  love: 'positive',
  flirt: 'positive',
  hype: 'positive',
  wholesome: 'positive',
  sad: 'melancholy',
  crying: 'melancholy',
  lonely: 'melancholy',
  pensive: 'melancholy',
  angry: 'intense',
  frustrated: 'intense',
  shocked: 'intense',
  scared: 'intense',
  thinking: 'contemplative',
  curious: 'contemplative',
  calm: 'neutral',
  neutral: 'neutral',
  bored: 'neutral',
};

/**
 * Prompt fragments keyed by emotion group, used when generating the background image.
 * These are appended to "an anime scene, " to build a LoRA-friendly prompt.
 */
const GROUP_PROMPTS: Record<string, string> = {
  positive: 'sunny park, cherry blossoms, warm golden light, vibrant colors',
  melancholy: 'rainy window at night, soft blue light, raindrops on glass, moody',
  intense: 'dramatic stormy sky, lightning in the distance, dark silhouette',
  contemplative: 'starry night sky, rooftop at dusk, peaceful, soft purple tones',
  neutral: 'cozy room interior, soft warm lighting, bookshelves, calm atmosphere',
};

/** Minimum milliseconds between background generation requests (debounce). */
const DEBOUNCE_MS = 5_000;

/**
 * Sends a postMessage to the embedded VRM viewer iframe to change its background.
 *
 * @param url - Absolute or root-relative URL of the image to display.
 */
function setViewerBackground(url: string): void {
  useViewerStore.getState().dispatchBackground('image', url);
}

/**
 * Auto-generates a contextual scene background whenever the emotion group
 * emitted by the LLM changes between assistant turns.
 *
 * Uses ``POST /api/image-gen/background`` to generate the image, then sets
 * it on the embedded VRM viewer via the ``updateBackground`` postMessage
 * protocol.  Generation is fire-and-forget; failures are silently ignored so
 * the main chat experience is never blocked.
 *
 * Generation is debounced by 5 seconds to avoid hammering the image-gen
 * service when multiple responses arrive in quick succession.
 *
 * @param currentEmotion - The ``emotion`` field from the latest assistant
 *   message (may be undefined while a response is streaming).
 * @param charId - The currently active character's database ID (forwarded
 *   to the image-gen backend for LoRA conditioning).
 * @param enabled - Set to ``false`` to disable auto-background generation
 *   (e.g., when the model panel is closed or image gen is not configured).
 *
 * @example
 * // In ChatThread:
 * useAutoBackground(lastEmotion, activeCharacter?.id, modelPanelOpen);
 */
export function useAutoBackground(
  currentEmotion: string | undefined,
  charId: number | undefined,
  enabled: boolean,
): void {
  const prevGroupRef = useRef<string | null>(null);
  const lastGenRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !currentEmotion || !charId) return;

    const currentGroup = EMOTION_GROUPS[currentEmotion.toLowerCase()] ?? 'neutral';
    const prevGroup = prevGroupRef.current;

    // Skip if emotion group hasn't changed.
    if (currentGroup === prevGroup) return;

    prevGroupRef.current = currentGroup;

    // Debounce — don't fire if we generated too recently.
    const now = Date.now();
    if (now - lastGenRef.current < DEBOUNCE_MS) return;
    lastGenRef.current = now;

    const prompt = `an anime scene, ${GROUP_PROMPTS[currentGroup] ?? GROUP_PROMPTS.neutral}`;

    // Fire-and-forget — never block the UI.
    api.generateBackground({ prompt, character_id: charId })
      .then(res => {
        if (res.ok && res.url) {
          setViewerBackground(res.url);
        } else if (res.ok && res.filename) {
          setViewerBackground(`/files/images/${res.filename}`);
        }
      })
      .catch(() => {
        // Image gen may not be configured — silently ignore.
      });
  }, [currentEmotion, charId, enabled]);
}
