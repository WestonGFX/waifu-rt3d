/**
 * DART emotion → gesture layer (Stage 3 Phase 5.1).
 *
 * The avatar has a pre-baked DART gesture vocabulary (cheer, clap, cross_arms,
 * stretch, shrug, bow, …) generated once on the RTX box and converted to
 * normalized-VRM GLBs via `tools/dart_to_glb.py` (see
 * `backend/motion/dart_gesture_library.json`). These are *body* gestures with
 * no Mixamo equivalent — exactly the gap the existing `KOKORO_GESTURE_CLIPS`
 * map leaves open.
 *
 * This module maps Kokoro's per-turn `emotion` to a DART gesture so the avatar
 * can react with her body to emotional tone, even on turns where the LLM did
 * NOT request an explicit gesture. The firing policy (chosen 2026-06-22) is
 * **gap-fill + throttled**: an emotion gesture fires only when there is no
 * explicit Kokoro gesture, the emotion maps to a body gesture, and a cooldown
 * has elapsed — keeping with the Kokoro brief of "gentle movement, not a
 * caffeinated VTuber." The wiring lives in
 * `viewerStore.dispatchKokoroEmbodiment`.
 *
 * Nothing here performs I/O; consumers receive a `KokoroEmotion` and get back a
 * gesture name (or null) plus a URL helper.
 */
import type { KokoroEmotion } from './kokoro';

/**
 * Base URL the backend serves the pre-baked DART gesture GLBs from. Mirrors
 * `url_base` in `backend/motion/dart_gesture_library.json`. The GLBs are
 * per-machine runtime assets (gitignored, regenerable with
 * `tools/build_dart_gestures.py`); a missing GLB degrades gracefully — the clip
 * simply never loads, so playback is a no-op (same as the Mixamo gesture path).
 */
export const DART_GESTURE_URL_BASE = '/files/animations/dart-gestures';

/**
 * Kokoro emotion → DART gesture name.
 *
 * Intentionally sparse: only distinctive, lower-frequency emotional peaks get a
 * body gesture. Common, gentle emotions (neutral, soft, happy, focused_warm,
 * concerned) are deliberately left unmapped so the avatar stays calm most of
 * the time — the throttle handles the rest. Every value must be a `name` in
 * `dart_gesture_library.json`.
 *
 * TUNABLE: this map is pure feel. Add/remove a line to retune which moods
 * trigger a gesture; nothing else depends on the exact pairings.
 */
export const KOKORO_EMOTION_TO_DART_GESTURE: Partial<Record<KokoroEmotion, string>> = {
  excited: 'cheer', // both arms up — peak-positive energy
  proud: 'cheer', // triumphant lift
  frustrated: 'cross_arms', // arms folded — playful sulk / annoyance
  sleepy: 'stretch', // low-arousal idle break
  playful: 'shrug', // light, breezy "whatever~"
};

/**
 * Minimum number of Kokoro embodiment turns between emotion-driven DART
 * gestures. A value of 3 means at most ~1 gap-fill gesture every 3 assistant
 * turns. The first eligible turn always fires (cooldown starts after it).
 *
 * TUNABLE: raise for a calmer avatar, lower (toward 1) for a livelier one.
 */
export const DART_GESTURE_COOLDOWN_TURNS = 3;

/**
 * Build the `/files` URL for a pre-baked DART gesture GLB.
 *
 * @param name - Gesture name (a `name` from `dart_gesture_library.json`).
 * @returns URL the viewer's `loadAnimation` can fetch.
 *
 * @example
 * dartGestureUrl('cheer'); // '/files/animations/dart-gestures/cheer.glb'
 */
export function dartGestureUrl(name: string): string {
  return `${DART_GESTURE_URL_BASE}/${name}.glb`;
}

/**
 * Resolve a Kokoro emotion to a gap-fill DART gesture name.
 *
 * @param emotion - Kokoro per-turn emotion enum.
 * @returns The mapped gesture name, or null when the emotion has no body
 *   gesture (the common, gentle case).
 *
 * @example
 * resolveDartGesture('excited'); // 'cheer'
 * resolveDartGesture('neutral'); // null
 */
export function resolveDartGesture(emotion: KokoroEmotion): string | null {
  return KOKORO_EMOTION_TO_DART_GESTURE[emotion] ?? null;
}
