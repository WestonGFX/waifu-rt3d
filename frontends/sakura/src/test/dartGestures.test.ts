/**
 * Tests for the DART emotion→gesture layer (Stage 3 Phase 5.1).
 *
 * Pure-function coverage of `lib/dartGestures.ts`: the emotion→gesture map,
 * the URL helper, the cooldown constant, and a drift guard that every mapped
 * gesture name exists in the pre-baked DART gesture vocabulary.
 *
 * Follows testing-conventions.md Pattern 1 (store-direct / pure) — no render.
 */
import { describe, it, expect } from 'vitest';
import {
  DART_GESTURE_COOLDOWN_TURNS,
  DART_GESTURE_URL_BASE,
  KOKORO_EMOTION_TO_DART_GESTURE,
  dartGestureUrl,
  resolveDartGesture,
} from '../lib/dartGestures';
import type { KokoroEmotion } from '../lib/kokoro';

/**
 * The gesture `name`s defined in backend/motion/dart_gesture_library.json.
 * Duplicated here intentionally: importing the backend JSON would cross the
 * sakura package boundary (vite fs.allow). If the library gains/loses a
 * gesture, update this set — the drift guard below will flag a stale map.
 */
const LIBRARY_GESTURE_NAMES = new Set([
  'wave',
  'clap',
  'cheer',
  'point',
  'cross_arms',
  'bow',
  'stretch',
  'shrug',
]);

describe('dartGestures — resolveDartGesture', () => {
  it('maps distinctive emotional peaks to body gestures', () => {
    expect(resolveDartGesture('excited')).toBe('cheer');
    expect(resolveDartGesture('proud')).toBe('cheer');
    expect(resolveDartGesture('frustrated')).toBe('cross_arms');
    expect(resolveDartGesture('sleepy')).toBe('stretch');
    expect(resolveDartGesture('playful')).toBe('shrug');
  });

  it('returns null for gentle / common emotions (stay calm by default)', () => {
    const unmapped: KokoroEmotion[] = [
      'neutral',
      'happy',
      'soft',
      'focused_warm',
      'concerned',
      'shy',
    ];
    for (const e of unmapped) {
      expect(resolveDartGesture(e)).toBeNull();
    }
  });
});

describe('dartGestures — dartGestureUrl', () => {
  it('builds the /files URL for a gesture GLB', () => {
    expect(dartGestureUrl('cheer')).toBe('/files/animations/dart-gestures/cheer.glb');
    expect(dartGestureUrl('cross_arms')).toBe(`${DART_GESTURE_URL_BASE}/cross_arms.glb`);
  });
});

describe('dartGestures — throttle + drift guards', () => {
  it('cooldown is a sane positive integer', () => {
    expect(DART_GESTURE_COOLDOWN_TURNS).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(DART_GESTURE_COOLDOWN_TURNS)).toBe(true);
  });

  it('every mapped gesture exists in the DART library vocabulary', () => {
    for (const name of Object.values(KOKORO_EMOTION_TO_DART_GESTURE)) {
      expect(LIBRARY_GESTURE_NAMES.has(name as string)).toBe(true);
    }
  });
});
