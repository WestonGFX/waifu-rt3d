/**
 * live2dParameterMap – Converts AnimeGirly avatar runtime signals to Live2D
 * Cubism parameter values.
 *
 * This module is a pure-function service (no React dependency) that bridges
 * the AnimeGirly emotion/gesture/gaze domain with the standard Live2D Cubism
 * parameter naming convention used by both Cubism2 (.model.json) and
 * Cubism4 (.model3.json) models.
 *
 * @see https://docs.live2d.com/en/cubism-sdk-manual/parameters/
 */

import { type AvatarEmotion, type AvatarGazeMode, type AvatarGesture } from '@/types/index.ts';

/* ── Standard Cubism parameter IDs ───────────────────────────────────────── */

/**
 * Canonical Live2D Cubism parameter names.
 *
 * Cubism4 models use the `ParamXxx` naming convention. Cubism2 models may
 * use shorter names but typically follow the same pattern.  Values are listed
 * here as named constants to avoid raw string literals scattered across the
 * codebase.
 */
export const PARAM = {
  /** Head tilt left/right.  Range: −30 to 30 degrees. */
  ANGLE_X:      'ParamAngleX',
  /** Head tilt up/down.  Range: −30 to 30 degrees. */
  ANGLE_Y:      'ParamAngleY',
  /** Head rotation (roll).  Range: −30 to 30 degrees. */
  ANGLE_Z:      'ParamAngleZ',

  /** Left eye openness.  0 = fully closed, 1 = fully open. */
  EYE_L_OPEN:   'ParamEyeLOpen',
  /** Right eye openness.  0 = fully closed, 1 = fully open. */
  EYE_R_OPEN:   'ParamEyeROpen',
  /** Left eye ball X position.  −1 = left, 1 = right. */
  EYE_BALL_X:   'ParamEyeBallX',
  /** Left/right eye ball Y position.  −1 = down, 1 = up. */
  EYE_BALL_Y:   'ParamEyeBallY',

  /** Left brow vertical offset.  −1 = raised, 1 = furrowed. */
  BROW_L_Y:     'ParamBrowLY',
  /** Right brow vertical offset.  −1 = raised, 1 = furrowed. */
  BROW_R_Y:     'ParamBrowRY',

  /** Mouth openness (vertical).  0 = closed, 1 = fully open. */
  MOUTH_OPEN_Y: 'ParamMouthOpenY',
  /** Mouth form (smile vs frown).  −1 = frown, 1 = full smile. */
  MOUTH_FORM:   'ParamMouthForm',

  /** Body lean left/right.  Range: −10 to 10. */
  BODY_ANGLE_X: 'ParamBodyAngleX',
  /** Body lean forward/back.  Range: −10 to 10. */
  BODY_ANGLE_Y: 'ParamBodyAngleY',
  /** Body rotation (roll).  Range: −10 to 10. */
  BODY_ANGLE_Z: 'ParamBodyAngleZ',

  /** Breathing cycle.  0 = exhale, 1 = inhale. */
  BREATH:       'ParamBreath',
} as const;

/* ── Public types ─────────────────────────────────────────────────────────── */

/**
 * A flat map of Live2D Cubism parameter IDs to their target values.
 *
 * All values are in the parameter's native range (e.g. −30 to 30 for angle
 * params, 0 to 1 for openness params).  Consumers should merge multiple
 * parameter sets before applying them to the model.
 *
 * @example
 * ```ts
 * const params = emotionToLive2DParams('warm', 0.8, 0.6);
 * // { ParamEyeLOpen: 0.9, ParamMouthForm: 0.65, ... }
 * ```
 */
export interface Live2DParameterSet {
  [paramId: string]: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Linearly interpolates between `a` and `b` by factor `t` (clamped to [0,1]).
 *
 * @param a - Start value.
 * @param b - End value.
 * @param t - Blend factor in [0, 1].
 * @returns Interpolated value.
 */
function lerp(a: number, b: number, t: number): number {
  const tc = Math.min(1, Math.max(0, t));
  return a + (b - a) * tc;
}

/* ── Emotion mapping ──────────────────────────────────────────────────────── */

/**
 * Maps an AnimeGirly avatar emotion plus energy/intimacy scalars to a set of
 * Live2D Cubism parameter values that express that emotion facially and
 * corporeally.
 *
 * Each emotion has a "base" expression that is then scaled by the `energy`
 * factor (0–1) so low-energy variants are softer and high-energy variants are
 * more pronounced.  The `intimacy` value slightly opens the eyes and warms
 * the mouth form to signal connection.
 *
 * @param emotion   - The dominant emotion from AvatarPerformanceMetadata.
 * @param energy    - Energy level 0–1 (scales expression intensity).
 * @param intimacy  - Intimacy level 0–1 (softens gaze and warms smile).
 * @returns Parameter set describing the facial/body expression.
 *
 * @example
 * ```ts
 * const params = emotionToLive2DParams('excited', 0.9, 0.4);
 * // ParamEyeLOpen + ParamEyeROpen ≈ 1.2, wide grin, raised brows
 * ```
 */
export function emotionToLive2DParams(
  emotion: AvatarEmotion,
  energy: number,
  intimacy: number,
): Live2DParameterSet {
  // Intimacy softly boosts eye openness (+0 to +0.15) and mouth form (+0 to +0.1)
  const intimacyEyeBoost   = intimacy * 0.15;
  const intimacySmileBoost = intimacy * 0.1;

  switch (emotion) {
    case 'neutral': {
      // Relaxed, resting expression — slightly soft eyes, gentle closed smile.
      return {
        [PARAM.EYE_L_OPEN]:   lerp(0.7, 0.85, energy) + intimacyEyeBoost,
        [PARAM.EYE_R_OPEN]:   lerp(0.7, 0.85, energy) + intimacyEyeBoost,
        [PARAM.MOUTH_FORM]:   lerp(0.1, 0.25, energy) + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: lerp(0,    0.05, energy),
        [PARAM.BROW_L_Y]:     lerp(0,    0.05, energy),
        [PARAM.BROW_R_Y]:     lerp(0,    0.05, energy),
        [PARAM.ANGLE_X]:      0,
        [PARAM.ANGLE_Y]:      lerp(0, -2, energy),
        [PARAM.BODY_ANGLE_X]: 0,
      };
    }

    case 'warm': {
      // Soft, caring eyes; gentle genuine smile; slight forward lean.
      return {
        [PARAM.EYE_L_OPEN]:   lerp(0.75, 0.9, energy) + intimacyEyeBoost,
        [PARAM.EYE_R_OPEN]:   lerp(0.75, 0.9, energy) + intimacyEyeBoost,
        [PARAM.MOUTH_FORM]:   lerp(0.45, 0.7, energy) + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: lerp(0,    0.2, energy),
        [PARAM.BROW_L_Y]:     lerp(0.1,  0.3, energy),
        [PARAM.BROW_R_Y]:     lerp(0.1,  0.3, energy),
        [PARAM.ANGLE_X]:      lerp(0,    3,   energy),
        [PARAM.ANGLE_Y]:      lerp(2,    5,   energy),
        [PARAM.BODY_ANGLE_X]: lerp(0,    2,   energy),
      };
    }

    case 'excited': {
      // Wide eyes, big open smile, energetic head tilt, raised brows.
      return {
        [PARAM.EYE_L_OPEN]:   Math.min(1.3, lerp(1.0, 1.3, energy) + intimacyEyeBoost),
        [PARAM.EYE_R_OPEN]:   Math.min(1.3, lerp(1.0, 1.3, energy) + intimacyEyeBoost),
        [PARAM.MOUTH_FORM]:   lerp(0.6, 1.0, energy) + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: lerp(0.3, 0.7, energy),
        [PARAM.BROW_L_Y]:     lerp(0.5, 1.0, energy),
        [PARAM.BROW_R_Y]:     lerp(0.5, 1.0, energy),
        [PARAM.ANGLE_X]:      lerp(-5,  -10, energy),
        [PARAM.ANGLE_Y]:      lerp(5,    10, energy),
        [PARAM.BODY_ANGLE_X]: lerp(-3,  -6,  energy),
      };
    }

    case 'shy': {
      // Half-closed eyes, averted gaze, slight head bow, blush-compatible expression.
      return {
        [PARAM.EYE_L_OPEN]:   lerp(0.35, 0.55, energy) + intimacyEyeBoost,
        [PARAM.EYE_R_OPEN]:   lerp(0.35, 0.55, energy) + intimacyEyeBoost,
        [PARAM.MOUTH_FORM]:   lerp(-0.1, 0.1, energy)  + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: 0,
        [PARAM.BROW_L_Y]:     lerp(-0.3, -0.1, energy),
        [PARAM.BROW_R_Y]:     lerp(-0.3, -0.1, energy),
        // Head bows down and to the side
        [PARAM.ANGLE_X]:      lerp(8,   12,  energy),
        [PARAM.ANGLE_Y]:      lerp(-8, -12,  energy),
        [PARAM.BODY_ANGLE_X]: lerp(4,    8,  energy),
      };
    }

    case 'playful': {
      // Right eye wink (left eye narrowed), smirk, slight head tilt.
      return {
        [PARAM.EYE_L_OPEN]:   lerp(0.6,  0.8,  energy) + intimacyEyeBoost,
        // Right eye significantly closed for a wink / smirk feel
        [PARAM.EYE_R_OPEN]:   lerp(0.15, 0.35, energy),
        [PARAM.MOUTH_FORM]:   lerp(0.3,  0.65, energy) + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: lerp(0,    0.25, energy),
        [PARAM.BROW_L_Y]:     lerp(0.2,  0.5,  energy),
        [PARAM.BROW_R_Y]:     lerp(-0.1, 0.15, energy),
        [PARAM.ANGLE_X]:      lerp(-8,  -14,   energy),
        [PARAM.ANGLE_Y]:      lerp(3,    6,    energy),
        [PARAM.BODY_ANGLE_X]: lerp(-3,  -5,    energy),
      };
    }

    case 'thoughtful': {
      // Slightly narrowed eyes, neutral-to-slight frown, gaze drifts upward-aside.
      return {
        [PARAM.EYE_L_OPEN]:   lerp(0.55, 0.7, energy) + intimacyEyeBoost,
        [PARAM.EYE_R_OPEN]:   lerp(0.55, 0.7, energy) + intimacyEyeBoost,
        [PARAM.MOUTH_FORM]:   lerp(-0.15, 0.1, energy) + intimacySmileBoost,
        [PARAM.MOUTH_OPEN_Y]: 0,
        [PARAM.BROW_L_Y]:     lerp(-0.2, 0.1, energy),
        [PARAM.BROW_R_Y]:     lerp(-0.2, 0.1, energy),
        [PARAM.ANGLE_X]:      lerp(5,  10,   energy),
        [PARAM.ANGLE_Y]:      lerp(-3, -6,   energy),
        [PARAM.BODY_ANGLE_X]: lerp(3,   5,   energy),
      };
    }

    default: {
      // Exhaustive guard — TypeScript will error here if AvatarEmotion gains a new variant.
      const _exhaustive: never = emotion;
      void _exhaustive;
      return {};
    }
  }
}

/* ── Gaze mapping ─────────────────────────────────────────────────────────── */

/**
 * Maps an AnimeGirly gaze mode to Live2D eye-ball and head-angle parameters.
 *
 * The eye ball parameters move the iris within the eye; the angle parameters
 * rotate the whole head to reinforce the gaze direction.
 *
 * @param gaze - The gaze mode from AvatarPerformanceMetadata.
 * @returns Parameter set describing gaze direction.
 *
 * @example
 * ```ts
 * const params = gazeToLive2DParams('down');
 * // { ParamEyeBallY: -0.6, ParamAngleY: -10 }
 * ```
 */
export function gazeToLive2DParams(gaze: AvatarGazeMode): Live2DParameterSet {
  switch (gaze) {
    case 'camera': {
      // Direct eye contact — iris centered, head level.
      return {
        [PARAM.EYE_BALL_X]: 0,
        [PARAM.EYE_BALL_Y]: 0,
        [PARAM.ANGLE_X]:    0,
        [PARAM.ANGLE_Y]:    0,
      };
    }

    case 'soft': {
      // Soft gaze slightly above center — approachable, relaxed.
      return {
        [PARAM.EYE_BALL_X]: 0,
        [PARAM.EYE_BALL_Y]: 0.15,
        [PARAM.ANGLE_X]:    5,
        [PARAM.ANGLE_Y]:    3,
      };
    }

    case 'down': {
      // Looking downward — bashful, submissive, or introspective.
      return {
        [PARAM.EYE_BALL_X]: 0,
        [PARAM.EYE_BALL_Y]: -0.6,
        [PARAM.ANGLE_X]:    0,
        [PARAM.ANGLE_Y]:   -10,
      };
    }

    case 'side': {
      // Gaze drifts to the side — thoughtful, distracted, or teasing.
      return {
        [PARAM.EYE_BALL_X]: 0.55,
        [PARAM.EYE_BALL_Y]: 0.1,
        [PARAM.ANGLE_X]:   15,
        [PARAM.ANGLE_Y]:   -3,
      };
    }

    default: {
      const _exhaustive: never = gaze;
      void _exhaustive;
      return {};
    }
  }
}

/* ── Gesture mapping ──────────────────────────────────────────────────────── */

/**
 * Maps an AnimeGirly gesture to Live2D body-angle parameters.
 *
 * Body angle parameters move the torso; head angle overrides from the gesture
 * layer reinforce the gesture's body language.  Motion clips on the model
 * itself are not triggered here — this service drives only the continuous
 * parameter state.
 *
 * @param gesture - The gesture from AvatarPerformanceMetadata.
 * @returns Parameter set describing body pose.
 *
 * @example
 * ```ts
 * const params = gestureToLive2DParams('nod');
 * // { ParamBodyAngleY: 8, ParamAngleY: 6 }
 * ```
 */
export function gestureToLive2DParams(gesture: AvatarGesture): Live2DParameterSet {
  switch (gesture) {
    case 'none': {
      return {
        [PARAM.BODY_ANGLE_X]: 0,
        [PARAM.BODY_ANGLE_Y]: 0,
        [PARAM.BODY_ANGLE_Z]: 0,
      };
    }

    case 'nod': {
      // Forward lean with slight upward head — agreement / acknowledgement.
      return {
        [PARAM.BODY_ANGLE_X]: 0,
        [PARAM.BODY_ANGLE_Y]: 8,
        [PARAM.BODY_ANGLE_Z]: 0,
        [PARAM.ANGLE_Y]:      6,
      };
    }

    case 'handToHeart': {
      // Slight body lean toward viewer, open expression — warmth gesture.
      return {
        [PARAM.BODY_ANGLE_X]: -2,
        [PARAM.BODY_ANGLE_Y]: 4,
        [PARAM.BODY_ANGLE_Z]: -3,
      };
    }

    case 'handToCheek': {
      // Head tilted into resting hand — shy / cute pose.
      return {
        [PARAM.BODY_ANGLE_X]: 8,
        [PARAM.BODY_ANGLE_Y]: -2,
        [PARAM.BODY_ANGLE_Z]: 4,
        [PARAM.ANGLE_X]:      10,
      };
    }

    case 'wave': {
      // Body opens toward viewer — energetic, welcoming.
      return {
        [PARAM.BODY_ANGLE_X]: -5,
        [PARAM.BODY_ANGLE_Y]: 3,
        [PARAM.BODY_ANGLE_Z]: -5,
      };
    }

    case 'point': {
      // Slight forward lean — assertive, playful pointing.
      return {
        [PARAM.BODY_ANGLE_X]: -3,
        [PARAM.BODY_ANGLE_Y]: 2,
        [PARAM.BODY_ANGLE_Z]: -2,
      };
    }

    default: {
      const _exhaustive: never = gesture;
      void _exhaustive;
      return {};
    }
  }
}

/* ── Merge utility ────────────────────────────────────────────────────────── */

/**
 * Merges two or more {@link Live2DParameterSet} objects into one.
 *
 * When the same parameter appears in multiple sets the **last** value wins,
 * which lets more-specific layers (e.g. gaze) override base-emotion angles.
 *
 * @param sets - One or more parameter sets to merge.
 * @returns A single merged parameter set.
 *
 * @example
 * ```ts
 * const merged = mergeParameterSets(
 *   emotionToLive2DParams('warm', 0.7, 0.5),
 *   gazeToLive2DParams('camera'),
 * );
 * ```
 */
export function mergeParameterSets(...sets: Live2DParameterSet[]): Live2DParameterSet {
  return Object.assign({}, ...sets) as Live2DParameterSet;
}
