/**
 * @fileoverview Idle animation library for VRM avatar idle behaviour.
 *
 * Provides a catalogue of keyframe-based idle presets and micro-gestures that
 * the ThreeViewer animation loop can sample at runtime.  Values are expressed
 * as Euler rotations in radians; the consuming code maps them onto VRM humanoid
 * bone nodes via the same `applyBoneRotation` helper used by the live baseline.
 *
 * Design constraints that come from the renderer:
 *  - Bone names must match the `SupportedBoneName` union in ThreeViewer.tsx.
 *  - Rotation magnitudes should stay within ±0.15 rad for structural bones so
 *    they can be additively blended on top of the procedural breathing baseline.
 *  - Micro-gesture durations are kept ≤ 3 s so they feel spontaneous.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * A single keyframe within an idle animation cycle.
 *
 * @example
 * const kf: IdleKeyframe = {
 *   boneName: 'head',
 *   rotation: [0, 0.08, 0],
 *   timeOffset: 0.5,
 *   easing: 'sine',
 * };
 */
export interface IdleKeyframe {
  /** VRM humanoid bone name (must match `SupportedBoneName` in ThreeViewer). */
  boneName: string;
  /** Euler rotation [x, y, z] in radians to target at `timeOffset`. */
  rotation: [number, number, number];
  /** Seconds from the start of a single cycle at which this target is reached. */
  timeOffset: number;
  /**
   * Interpolation curve applied when transitioning into this keyframe.
   * - `'linear'`     — constant rate.
   * - `'sine'`       — `sin`-smoothed, natural for limb drift.
   * - `'ease-in-out'` — cubic smooth-step, good for weight shifts.
   */
  easing: 'linear' | 'sine' | 'ease-in-out';
}

/**
 * A complete idle animation preset comprised of one or more {@link IdleKeyframe}
 * records that together define a looping posture cycle for a VRM avatar.
 *
 * @example
 * const preset: IdleAnimationPreset = {
 *   id: 'neutral-sway',
 *   name: 'Neutral Sway',
 *   category: 'base',
 *   duration: 4,
 *   keyframes: [...],
 * };
 */
export interface IdleAnimationPreset {
  /** Stable identifier used for lookups and cross-references. */
  id: string;
  /** Human-readable display label. */
  name: string;
  /**
   * - `'base'`          — full-body posture loop; one should always be active.
   * - `'micro-gesture'` — brief single-bone accent; layered on top of a base.
   */
  category: 'base' | 'micro-gesture';
  /** Duration of one complete loop in seconds. */
  duration: number;
  /** All keyframes that compose this preset, potentially spanning multiple bones. */
  keyframes: IdleKeyframe[];
  /**
   * Optional VRM expression (BlendShape) overrides active during this preset.
   * Keys are expression names recognised by `VRM.expressionManager`; values are
   * normalised weights in [0, 1].
   */
  blendShapes?: Record<string, number>;
}

/**
 * Describes which idle presets should be active for a given avatar state,
 * combining a continuously-looping base posture with a stochastic schedule of
 * shorter micro-gestures.
 *
 * @example
 * const set: IdleAnimationSet = {
 *   basePresetId: 'neutral-sway',
 *   microGestureIds: ['hair-tuck', 'head-tilt'],
 *   microGestureIntervalRange: [8, 20],
 * };
 */
export interface IdleAnimationSet {
  /** ID of the {@link IdleAnimationPreset} with `category === 'base'` to loop. */
  basePresetId: string;
  /** IDs of micro-gesture presets that fire stochastically. */
  microGestureIds: string[];
  /**
   * `[min, max]` seconds between successive micro-gesture triggers.
   * The runtime picks a uniform random value in this range after each gesture
   * completes.
   */
  microGestureIntervalRange: [number, number];
}

// ---------------------------------------------------------------------------
// Preset catalogue
// ---------------------------------------------------------------------------

/**
 * Full library of {@link IdleAnimationPreset} objects — 8 base postures and
 * 10 micro-gestures.
 *
 * Rotation convention: `[x, y, z]` Euler radians in VRM humanoid space.
 * Positive-x tilts forward, positive-y rotates left, positive-z rolls
 * counter-clockwise when viewed from the positive axis.  All values are small
 * (≤ ±0.15 rad structural, ≤ ±0.40 rad for arm articulation) so they blend
 * cleanly on top of ThreeViewer's procedural breathing baseline.
 */
export const IDLE_PRESETS: IdleAnimationPreset[] = [
  // ── Base presets ────────────────────────────────────────────────────────

  {
    id: 'neutral-sway',
    name: 'Neutral Sway',
    category: 'base',
    duration: 4,
    keyframes: [
      // Spine drifts gently left
      { boneName: 'spine',  rotation: [0.02, 0.00,  0.03], timeOffset: 0.0, easing: 'sine' },
      { boneName: 'chest',  rotation: [0.04, 0.00,  0.02], timeOffset: 0.0, easing: 'sine' },
      { boneName: 'hips',   rotation: [-0.02, 0.00, 0.02], timeOffset: 0.0, easing: 'sine' },
      // Mid-cycle: drift right
      { boneName: 'spine',  rotation: [0.02, 0.00, -0.03], timeOffset: 2.0, easing: 'sine' },
      { boneName: 'chest',  rotation: [0.04, 0.00, -0.02], timeOffset: 2.0, easing: 'sine' },
      { boneName: 'hips',   rotation: [-0.02, 0.00, -0.02], timeOffset: 2.0, easing: 'sine' },
    ],
    blendShapes: { happy: 0.12 },
  },

  {
    id: 'weight-shifting',
    name: 'Weight Shifting',
    category: 'base',
    duration: 5,
    keyframes: [
      // Lean onto left hip
      { boneName: 'hips',        rotation: [-0.03, 0.04,  0.06], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'spine',       rotation: [0.02,  0.00,  0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftUpperLeg', rotation: [0.06, 0.00, -0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      // Neutral centre
      { boneName: 'hips',        rotation: [-0.02, 0.00,  0.00], timeOffset: 1.2, easing: 'ease-in-out' },
      { boneName: 'spine',       rotation: [0.02,  0.00,  0.00], timeOffset: 1.2, easing: 'ease-in-out' },
      { boneName: 'leftUpperLeg', rotation: [0.04, 0.00,  0.00], timeOffset: 1.2, easing: 'ease-in-out' },
      // Lean onto right hip
      { boneName: 'hips',        rotation: [-0.03, -0.04, -0.06], timeOffset: 2.5, easing: 'ease-in-out' },
      { boneName: 'spine',       rotation: [0.02,  0.00,  -0.04], timeOffset: 2.5, easing: 'ease-in-out' },
      { boneName: 'rightUpperLeg', rotation: [0.06, 0.00,  0.04], timeOffset: 2.5, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'crossed-arms',
    name: 'Crossed Arms',
    category: 'base',
    duration: 4,
    keyframes: [
      // Arms brought across chest, slight forward lean
      { boneName: 'spine',        rotation: [0.06,  0.00,  0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',        rotation: [0.08,  0.00,  0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftUpperArm', rotation: [0.20,  0.14, -0.28], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.20, -0.14,  0.28], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftLowerArm', rotation: [-0.60, 0.10, -0.05], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.60, -0.10, 0.05], timeOffset: 0.0, easing: 'ease-in-out' },
      // Gentle swaying in the crossed-arm position (mirror of start with tiny z shift)
      { boneName: 'spine',        rotation: [0.06,  0.00, -0.02], timeOffset: 2.0, easing: 'sine' },
      { boneName: 'chest',        rotation: [0.08,  0.00, -0.02], timeOffset: 2.0, easing: 'sine' },
    ],
    blendShapes: { neutral: 0.18 },
  },

  {
    id: 'hands-behind-back',
    name: 'Hands Behind Back',
    category: 'base',
    duration: 5,
    keyframes: [
      // Slight backward lean, chest open, arms behind
      { boneName: 'spine',        rotation: [-0.04, 0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',        rotation: [-0.06, 0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftUpperArm', rotation: [0.08, -0.10, -0.38], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.08, 0.10,  0.38], timeOffset: 0.0, easing: 'ease-in-out' },
      // Gentle sway mid-cycle
      { boneName: 'spine',        rotation: [-0.04, 0.00, 0.02], timeOffset: 2.5, easing: 'sine' },
      { boneName: 'chest',        rotation: [-0.06, 0.00, 0.02], timeOffset: 2.5, easing: 'sine' },
    ],
    blendShapes: { happy: 0.08, relaxed: 0.22 },
  },

  {
    id: 'hip-cock',
    name: 'Hip Cock',
    category: 'base',
    duration: 4,
    keyframes: [
      // Asymmetric hip pose, right hand-on-hip implied by arm rotation
      { boneName: 'hips',         rotation: [-0.03, 0.05,  0.08], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'spine',        rotation: [0.02,  -0.03, -0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',        rotation: [0.03,  -0.02,  0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.10, 0.00, 0.36], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.40, -0.04, 0.08], timeOffset: 0.0, easing: 'ease-in-out' },
      // Micro weight drift at mid-cycle
      { boneName: 'hips',         rotation: [-0.03, 0.04,  0.06], timeOffset: 2.0, easing: 'sine' },
      { boneName: 'spine',        rotation: [0.02,  -0.02, -0.03], timeOffset: 2.0, easing: 'sine' },
    ],
    blendShapes: { happy: 0.15 },
  },

  {
    id: 'nervous-fidget',
    name: 'Nervous Fidget',
    category: 'base',
    duration: 2,
    keyframes: [
      // Quick small bob of the head and clasped hands
      { boneName: 'head',         rotation: [-0.04, 0.02,  0.01], timeOffset: 0.0, easing: 'linear' },
      { boneName: 'neck',         rotation: [0.02,  0.01,  0.00], timeOffset: 0.0, easing: 'linear' },
      { boneName: 'leftUpperArm', rotation: [0.18,  0.06, -0.12], timeOffset: 0.0, easing: 'linear' },
      { boneName: 'rightUpperArm', rotation: [0.18, -0.06, 0.12], timeOffset: 0.0, easing: 'linear' },
      // Opposite bob
      { boneName: 'head',         rotation: [-0.02, -0.02, -0.01], timeOffset: 1.0, easing: 'linear' },
      { boneName: 'neck',         rotation: [0.01,  -0.01,  0.00], timeOffset: 1.0, easing: 'linear' },
    ],
    blendShapes: { neutral: 0.10, surprised: 0.04 },
  },

  {
    id: 'relaxed-lean',
    name: 'Relaxed Lean',
    category: 'base',
    duration: 5,
    keyframes: [
      // Casual lean to one side, shoulders dropped
      { boneName: 'spine',         rotation: [0.02,  0.03, -0.05], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',         rotation: [0.03,  0.02, -0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftShoulder',  rotation: [0.00,  0.00, -0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightShoulder', rotation: [0.00,  0.00,  0.04], timeOffset: 0.0, easing: 'ease-in-out' },
      // Gentle return
      { boneName: 'spine',         rotation: [0.02,  0.01, -0.02], timeOffset: 2.5, easing: 'sine' },
      { boneName: 'chest',         rotation: [0.03,  0.01, -0.02], timeOffset: 2.5, easing: 'sine' },
    ],
    blendShapes: { relaxed: 0.30, happy: 0.06 },
  },

  {
    id: 'attentive-stand',
    name: 'Attentive Stand',
    category: 'base',
    duration: 4,
    keyframes: [
      // Upright, slight forward lean, controlled posture
      { boneName: 'spine',        rotation: [0.04,  0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',        rotation: [0.05,  0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'head',         rotation: [-0.04, 0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftShoulder', rotation: [0.01,  0.00, -0.02], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightShoulder', rotation: [0.01, 0.00,  0.02], timeOffset: 0.0, easing: 'ease-in-out' },
      // Tiny breathing arc at mid-cycle
      { boneName: 'chest',        rotation: [0.06,  0.00, 0.00], timeOffset: 2.0, easing: 'sine' },
    ],
    blendShapes: { neutral: 0.06 },
  },

  // ── Micro-gestures ───────────────────────────────────────────────────────

  {
    id: 'hair-tuck',
    name: 'Hair Tuck',
    category: 'micro-gesture',
    duration: 1.8,
    keyframes: [
      // Right hand rises to tuck hair behind ear
      { boneName: 'rightUpperArm', rotation: [0.20,  -0.10, 0.18], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.70, -0.06, 0.08], timeOffset: 0.4, easing: 'ease-in-out' },
      // Return to natural rest
      { boneName: 'rightUpperArm', rotation: [0.13, -0.02, 0.30], timeOffset: 1.8, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.55, -0.06, 0.06], timeOffset: 1.8, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'head-tilt',
    name: 'Head Tilt',
    category: 'micro-gesture',
    duration: 2.0,
    keyframes: [
      { boneName: 'head', rotation: [-0.05, 0.06, 0.10], timeOffset: 0.0, easing: 'sine' },
      { boneName: 'neck', rotation: [0.00,  0.03, 0.06], timeOffset: 0.2, easing: 'sine' },
      // Hold
      { boneName: 'head', rotation: [-0.05, 0.06, 0.10], timeOffset: 1.2, easing: 'sine' },
      // Return
      { boneName: 'head', rotation: [-0.06, 0.00, 0.00], timeOffset: 2.0, easing: 'ease-in-out' },
      { boneName: 'neck', rotation: [0.00,  0.00, 0.00], timeOffset: 2.0, easing: 'ease-in-out' },
    ],
    blendShapes: { happy: 0.10 },
  },

  {
    id: 'stretch-arms',
    name: 'Stretch Arms',
    category: 'micro-gesture',
    duration: 2.5,
    keyframes: [
      // Arms rise with a small inhale
      { boneName: 'leftUpperArm',  rotation: [0.26, 0.06, -0.20], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.26, -0.06, 0.20], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'chest',         rotation: [0.08, 0.00, 0.00],  timeOffset: 0.2, easing: 'ease-in-out' },
      // Hold at peak
      { boneName: 'leftUpperArm',  rotation: [0.30, 0.06, -0.22], timeOffset: 1.0, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.30, -0.06, 0.22], timeOffset: 1.0, easing: 'ease-in-out' },
      // Return
      { boneName: 'leftUpperArm',  rotation: [0.14, 0.02, -0.30], timeOffset: 2.5, easing: 'ease-in-out' },
      { boneName: 'rightUpperArm', rotation: [0.13, -0.02, 0.30], timeOffset: 2.5, easing: 'ease-in-out' },
      { boneName: 'chest',         rotation: [0.04, 0.00, 0.00],  timeOffset: 2.5, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'check-phone',
    name: 'Check Phone',
    category: 'micro-gesture',
    duration: 3.0,
    keyframes: [
      // Right hand comes up, head tilts down as if reading
      { boneName: 'rightUpperArm', rotation: [0.16, -0.05, 0.10], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.80, -0.04, 0.06], timeOffset: 0.3, easing: 'ease-in-out' },
      { boneName: 'head',          rotation: [0.08,  0.00, -0.02], timeOffset: 0.5, easing: 'sine' },
      // Hold
      { boneName: 'head',          rotation: [0.10,  0.02, -0.02], timeOffset: 1.8, easing: 'sine' },
      // Return
      { boneName: 'rightUpperArm', rotation: [0.13, -0.02, 0.30], timeOffset: 3.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.55, -0.06, 0.06], timeOffset: 3.0, easing: 'ease-in-out' },
      { boneName: 'head',          rotation: [-0.06, 0.00, 0.00],  timeOffset: 3.0, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'play-with-hair',
    name: 'Play with Hair',
    category: 'micro-gesture',
    duration: 2.8,
    keyframes: [
      // Left hand rises and makes a gentle twisting motion at the ear
      { boneName: 'leftUpperArm', rotation: [0.22,  0.10, -0.20], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'leftLowerArm', rotation: [-0.65, 0.08, -0.06], timeOffset: 0.4, easing: 'sine' },
      // Slight twist
      { boneName: 'leftUpperArm', rotation: [0.24,  0.12, -0.22], timeOffset: 1.4, easing: 'sine' },
      { boneName: 'leftLowerArm', rotation: [-0.62, 0.10, -0.08], timeOffset: 1.4, easing: 'sine' },
      // Return
      { boneName: 'leftUpperArm', rotation: [0.14,  0.02, -0.30], timeOffset: 2.8, easing: 'ease-in-out' },
      { boneName: 'leftLowerArm', rotation: [-0.52, 0.06, -0.06], timeOffset: 2.8, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'look-around',
    name: 'Look Around',
    category: 'micro-gesture',
    duration: 2.5,
    keyframes: [
      // Turn left
      { boneName: 'head', rotation: [-0.05,  0.14, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'neck', rotation: [0.00,   0.08, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      // Centre
      { boneName: 'head', rotation: [-0.06,  0.00, 0.00], timeOffset: 1.0, easing: 'sine' },
      { boneName: 'neck', rotation: [0.00,   0.00, 0.00], timeOffset: 1.0, easing: 'sine' },
      // Turn right
      { boneName: 'head', rotation: [-0.05, -0.14, 0.00], timeOffset: 1.8, easing: 'ease-in-out' },
      { boneName: 'neck', rotation: [0.00,  -0.08, 0.00], timeOffset: 1.8, easing: 'ease-in-out' },
      // Return
      { boneName: 'head', rotation: [-0.06,  0.00, 0.00], timeOffset: 2.5, easing: 'ease-in-out' },
      { boneName: 'neck', rotation: [0.00,   0.00, 0.00], timeOffset: 2.5, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'shoulder-roll',
    name: 'Shoulder Roll',
    category: 'micro-gesture',
    duration: 2.0,
    keyframes: [
      // Shoulders rise forward together
      { boneName: 'leftShoulder',  rotation: [0.04, 0.00, -0.04], timeOffset: 0.0, easing: 'sine' },
      { boneName: 'rightShoulder', rotation: [0.04, 0.00,  0.04], timeOffset: 0.0, easing: 'sine' },
      // Peak of roll
      { boneName: 'leftShoulder',  rotation: [0.00, -0.04, -0.06], timeOffset: 1.0, easing: 'sine' },
      { boneName: 'rightShoulder', rotation: [0.00,  0.04,  0.06], timeOffset: 1.0, easing: 'sine' },
      // Return
      { boneName: 'leftShoulder',  rotation: [0.01,  0.00, -0.03], timeOffset: 2.0, easing: 'ease-in-out' },
      { boneName: 'rightShoulder', rotation: [0.01,  0.00,  0.03], timeOffset: 2.0, easing: 'ease-in-out' },
    ],
  },

  {
    id: 'chin-touch',
    name: 'Chin Touch',
    category: 'micro-gesture',
    duration: 2.4,
    keyframes: [
      // Right hand rises to chin, head dips slightly — thoughtful
      { boneName: 'rightUpperArm', rotation: [0.18, -0.06, 0.12], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.72, -0.04, 0.06], timeOffset: 0.4, easing: 'ease-in-out' },
      { boneName: 'head',          rotation: [0.04,  0.04, -0.02], timeOffset: 0.5, easing: 'sine' },
      // Hold
      { boneName: 'head',          rotation: [0.06,  0.06, -0.02], timeOffset: 1.6, easing: 'sine' },
      // Return
      { boneName: 'rightUpperArm', rotation: [0.13, -0.02, 0.30], timeOffset: 2.4, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.55, -0.06, 0.06], timeOffset: 2.4, easing: 'ease-in-out' },
      { boneName: 'head',          rotation: [-0.06, 0.00, 0.00],  timeOffset: 2.4, easing: 'ease-in-out' },
    ],
    blendShapes: { neutral: 0.08 },
  },

  {
    id: 'small-wave',
    name: 'Small Wave',
    category: 'micro-gesture',
    duration: 2.0,
    keyframes: [
      // Right hand lifts with a wrist wag
      { boneName: 'rightUpperArm', rotation: [0.28, -0.08, 0.12], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.50, -0.06, 0.04], timeOffset: 0.2, easing: 'sine' },
      // Wag right
      { boneName: 'rightLowerArm', rotation: [-0.50, -0.14, 0.04], timeOffset: 0.7, easing: 'sine' },
      // Wag left
      { boneName: 'rightLowerArm', rotation: [-0.50,  0.04, 0.04], timeOffset: 1.2, easing: 'sine' },
      // Return
      { boneName: 'rightUpperArm', rotation: [0.13, -0.02, 0.30], timeOffset: 2.0, easing: 'ease-in-out' },
      { boneName: 'rightLowerArm', rotation: [-0.55, -0.06, 0.06], timeOffset: 2.0, easing: 'ease-in-out' },
    ],
    blendShapes: { happy: 0.18 },
  },

  {
    id: 'huff',
    name: 'Huff',
    category: 'micro-gesture',
    duration: 1.5,
    keyframes: [
      // Chest swells with an emphatic inhale, then deflates with a small forward bow
      { boneName: 'chest', rotation: [0.10, 0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      { boneName: 'spine', rotation: [0.06, 0.00, 0.00], timeOffset: 0.0, easing: 'ease-in-out' },
      // Peak inflation
      { boneName: 'chest', rotation: [0.14, 0.00, 0.00], timeOffset: 0.5, easing: 'ease-in-out' },
      // Deflate — slight forward bow to sell the exhale
      { boneName: 'chest', rotation: [0.04, 0.00, 0.00], timeOffset: 1.2, easing: 'sine' },
      { boneName: 'spine', rotation: [0.03, 0.00, 0.00], timeOffset: 1.2, easing: 'sine' },
      // Return
      { boneName: 'chest', rotation: [0.04, 0.00, 0.00], timeOffset: 1.5, easing: 'ease-in-out' },
      { boneName: 'spine', rotation: [0.02, 0.00, 0.00], timeOffset: 1.5, easing: 'ease-in-out' },
    ],
    blendShapes: { angry: 0.08 },
  },
];

// ---------------------------------------------------------------------------
// Dere-type defaults
// ---------------------------------------------------------------------------

/**
 * Maps each {@link DereType} string to a sensible default {@link IdleAnimationSet}.
 * The selections reflect the character archetype:
 *  - Tsundere keeps arms defensively crossed with an occasional proud huff.
 *  - Deredere sways happily and waves / tosses hair.
 *  - Kuudere stands perfectly still and alert with minimal accent gestures.
 *  - Dandere fidgets nervously and plays with hair.
 *  - Genki has an expressive hip-cock posture with energetic gestures.
 *  - Onee-san leans back relaxed and occasionally touches her chin thoughtfully.
 *
 * Types not explicitly listed fall back to the neutral-sway base preset via
 * {@link getIdleSetForDereType}.
 */
export const DERE_IDLE_DEFAULTS: Record<string, IdleAnimationSet> = {
  tsundere: {
    basePresetId: 'crossed-arms',
    microGestureIds: ['huff'],
    microGestureIntervalRange: [10, 18],
  },
  deredere: {
    basePresetId: 'neutral-sway',
    microGestureIds: ['small-wave', 'hair-tuck'],
    microGestureIntervalRange: [8, 16],
  },
  kuudere: {
    basePresetId: 'attentive-stand',
    microGestureIds: ['head-tilt'],
    microGestureIntervalRange: [15, 30],
  },
  dandere: {
    basePresetId: 'nervous-fidget',
    microGestureIds: ['play-with-hair'],
    microGestureIntervalRange: [6, 14],
  },
  genki: {
    basePresetId: 'hip-cock',
    microGestureIds: ['small-wave', 'stretch-arms'],
    microGestureIntervalRange: [5, 12],
  },
  'onee-san': {
    basePresetId: 'relaxed-lean',
    microGestureIds: ['hair-tuck', 'chin-touch'],
    microGestureIntervalRange: [12, 22],
  },
};

/**
 * Default {@link IdleAnimationSet} used whenever a dere-type is not present in
 * {@link DERE_IDLE_DEFAULTS}.
 */
const DEFAULT_IDLE_SET: IdleAnimationSet = {
  basePresetId: 'neutral-sway',
  microGestureIds: ['head-tilt'],
  microGestureIntervalRange: [10, 20],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves a single {@link IdleAnimationPreset} by its stable `id`.
 *
 * @param id - The preset identifier (e.g. `'neutral-sway'`, `'hair-tuck'`).
 * @returns The matching preset, or `undefined` if the id is not found.
 *
 * @example
 * const preset = getIdlePreset('hip-cock');
 * if (preset) {
 *   console.log(preset.duration); // 4
 * }
 */
export function getIdlePreset(id: string): IdleAnimationPreset | undefined {
  return IDLE_PRESETS.find((p) => p.id === id);
}

/**
 * Returns the {@link IdleAnimationSet} registered for a given dere-type string.
 * Falls back to a neutral-sway set for unrecognised types so callers never
 * receive `undefined`.
 *
 * @param dereType - A {@link DereType} string (e.g. `'tsundere'`, `'genki'`).
 * @returns The idle set appropriate for that archetype.
 *
 * @example
 * const set = getIdleSetForDereType('dandere');
 * console.log(set.basePresetId); // 'nervous-fidget'
 */
export function getIdleSetForDereType(dereType: string): IdleAnimationSet {
  return DERE_IDLE_DEFAULTS[dereType] ?? DEFAULT_IDLE_SET;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Applies a named easing function to a normalised `t` value in [0, 1].
 *
 * @param t      - Normalised progress, clamped to [0, 1].
 * @param easing - Name of the easing curve.
 * @returns Eased value in [0, 1].
 */
function applyEasing(t: number, easing: IdleKeyframe['easing']): number {
  const clamped = Math.min(1, Math.max(0, t));
  switch (easing) {
    case 'sine':
      // Smoothed with a half sine arc — stays in [0, 1]
      return (1 - Math.cos(clamped * Math.PI)) * 0.5;
    case 'ease-in-out':
      // Cubic smooth-step: 3t² − 2t³
      return clamped * clamped * (3 - 2 * clamped);
    case 'linear':
    default:
      return clamped;
  }
}

/**
 * Linearly interpolates between two rotation triples component-wise.
 *
 * @param a - Start rotation [x, y, z].
 * @param b - End rotation [x, y, z].
 * @param t - Blend factor in [0, 1].
 * @returns Interpolated rotation triple.
 */
function lerpRotation(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Samples an {@link IdleAnimationPreset} at a given time within its cycle and
 * returns the current target rotation for every bone referenced by that preset.
 *
 * The algorithm groups all keyframes by `boneName` and then, for each bone,
 * finds the pair of keyframes that bracket `timeInCycle`.  The result is the
 * eased interpolation between those two keyframes.
 *
 * Edge cases:
 *  - `timeInCycle` before the first keyframe returns the first keyframe's rotation.
 *  - `timeInCycle` after the last keyframe wraps cyclically back to the first.
 *  - A bone with only one keyframe always returns that keyframe's rotation.
 *
 * @param preset      - The preset to sample.
 * @param timeInCycle - Current position within the cycle in seconds.
 *                      Should be in `[0, preset.duration)` but values outside
 *                      this range are wrapped with modulo.
 * @returns A mapping from `boneName` → `[x, y, z]` rotation in radians.
 *
 * @example
 * const preset = getIdlePreset('neutral-sway')!;
 * const rotations = interpolateKeyframes(preset, 1.0);
 * // rotations['spine'] → e.g. [0.02, 0, 0.015]
 */
export function interpolateKeyframes(
  preset: IdleAnimationPreset,
  timeInCycle: number,
): Record<string, [number, number, number]> {
  // Wrap the time into [0, duration) for seamless looping.
  const wrappedTime =
    preset.duration > 0
      ? ((timeInCycle % preset.duration) + preset.duration) % preset.duration
      : 0;

  // Group keyframes by bone name, preserving insertion order.
  const byBone = new Map<string, IdleKeyframe[]>();
  for (const kf of preset.keyframes) {
    const existing = byBone.get(kf.boneName);
    if (existing !== undefined) {
      existing.push(kf);
    } else {
      byBone.set(kf.boneName, [kf]);
    }
  }

  const result: Record<string, [number, number, number]> = {};

  for (const [boneName, keyframes] of byBone) {
    // Sort ascending by timeOffset so bracket search is O(n).
    const sorted = keyframes.slice().sort((a, b) => a.timeOffset - b.timeOffset);

    if (sorted.length === 1) {
      result[boneName] = sorted[0].rotation;
      continue;
    }

    // Time before or at the first keyframe — return first keyframe's pose.
    if (wrappedTime <= sorted[0].timeOffset) {
      result[boneName] = sorted[0].rotation;
      continue;
    }

    // Time after the last keyframe — wrap back and interpolate toward first.
    const last = sorted[sorted.length - 1];
    if (wrappedTime >= last.timeOffset) {
      const segmentLength = preset.duration - last.timeOffset;
      if (segmentLength <= 0) {
        result[boneName] = last.rotation;
        continue;
      }
      const rawT = (wrappedTime - last.timeOffset) / segmentLength;
      // The easing of the wrap-around segment uses the *first* keyframe's easing
      // because we are arriving at the first keyframe.
      const easedT = applyEasing(rawT, sorted[0].easing);
      result[boneName] = lerpRotation(last.rotation, sorted[0].rotation, easedT);
      continue;
    }

    // Find the bracketing pair.
    let from = sorted[0];
    let to = sorted[1];
    for (let i = 1; i < sorted.length - 1; i++) {
      if (sorted[i].timeOffset <= wrappedTime && wrappedTime < sorted[i + 1].timeOffset) {
        from = sorted[i];
        to = sorted[i + 1];
        break;
      }
      // Handle the final pair (last two elements) falling through.
      if (i === sorted.length - 2) {
        from = sorted[i];
        to = sorted[i + 1];
      }
    }

    const segmentLength = to.timeOffset - from.timeOffset;
    const rawT = segmentLength > 0 ? (wrappedTime - from.timeOffset) / segmentLength : 1;
    const easedT = applyEasing(rawT, to.easing);
    result[boneName] = lerpRotation(from.rotation, to.rotation, easedT);
  }

  return result;
}
