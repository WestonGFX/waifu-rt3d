import { type AnimationClip, type AnimationProvider } from '../types.ts';
import { type AnimationContext } from '../../types/index.ts';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createGestureBones(context: AnimationContext, intensity: number): AnimationClip['bones'] {
  const baseChest = 0.05 + context.metadata.energy * 0.08;

  switch (context.metadata.gesture) {
    case 'handToHeart':
      return {
        chest: { rotation: [baseChest, 0.02, 0] },
        leftUpperArm: { rotation: [-0.35 * intensity, 0.2, -0.22] },
        leftLowerArm: { rotation: [-0.4 * intensity, 0.04, 0.08] },
        rightUpperArm: { rotation: [-0.1, -0.08, 0.05] },
      };

    case 'handToCheek':
      return {
        neck: { rotation: [0.05, -0.04, -0.08] },
        rightUpperArm: { rotation: [-0.48 * intensity, -0.16, 0.18] },
        rightLowerArm: { rotation: [-0.52 * intensity, -0.1, -0.04] },
        leftUpperArm: { rotation: [-0.06, 0.05, -0.02] },
      };

    case 'wave':
      return {
        chest: { rotation: [baseChest * 0.8, 0.05, 0] },
        rightUpperArm: { rotation: [-0.7 * intensity, -0.16, 0.34] },
        rightLowerArm: { rotation: [-0.82 * intensity, 0.06, 0.2] },
        head: { rotation: [0.02, 0.08, 0] },
      };

    case 'point':
      return {
        chest: { rotation: [baseChest * 0.7, -0.08, 0] },
        rightUpperArm: { rotation: [-0.3 * intensity, -0.3, 0.16] },
        rightLowerArm: { rotation: [-0.18, 0.04, 0.05] },
      };

    case 'nod':
      return {
        head: { rotation: [0.06 * intensity, 0, 0] },
        neck: { rotation: [0.03 * intensity, 0, 0] },
      };

    default:
      return {
        chest: { rotation: [baseChest, 0, 0] },
        leftUpperArm: { rotation: [-0.08, 0.02, -0.02] },
        rightUpperArm: { rotation: [-0.08, -0.02, 0.02] },
      };
  }
}

function createExpressionState(context: AnimationContext, intensity: number) {
  const { emotion, reaction, talkIntensity } = context.metadata;

  const smileBase =
    emotion === 'warm' ? 0.72 :
      emotion === 'playful' ? 0.66 :
        emotion === 'excited' ? 0.58 :
          emotion === 'shy' ? 0.4 :
            emotion === 'thoughtful' ? 0.28 : 0.18;

  const brows =
    reaction === 'surprised' ? 0.72 :
      emotion === 'thoughtful' ? 0.48 :
        emotion === 'shy' ? 0.3 : 0.18;

  return {
    smile: clamp01(smileBase * intensity),
    brows: clamp01(brows * intensity),
    blinkRate: 2.8 + (1 - context.metadata.energy) * 1.6 + (emotion === 'shy' ? 0.5 : 0),
    mouthOpen: clamp01(talkIntensity * (0.55 + context.tuning.talkiness * 0.55)),
    mouthSpread: clamp01((smileBase * 0.7 + talkIntensity * 0.18) * intensity),
  };
}

function createGaze(context: AnimationContext, intensity: number) {
  const gazeScale = 0.22 + context.tuning.gazeStrength * 0.2;
  switch (context.metadata.gaze) {
    case 'camera':
      return { yaw: 0.04 * intensity, pitch: -0.02 * intensity };
    case 'down':
      return { yaw: -0.04 * gazeScale, pitch: 0.12 * gazeScale };
    case 'side':
      return { yaw: 0.18 * gazeScale, pitch: 0.01 };
    default:
      return { yaw: 0.08 * gazeScale, pitch: 0.03 * gazeScale };
  }
}

export class PerformanceAnimationProvider implements AnimationProvider {
  readonly name = 'performance';
  readonly label = 'Deterministic performance runtime';

  isSupported(): boolean {
    return true;
  }

  async generate(context: AnimationContext): Promise<AnimationClip | null> {
    const intensity = clamp01(
      context.tuning.animationIntensity * 0.55 +
      context.metadata.energy * 0.2 +
      context.moodCarry * 0.25,
    );

    return {
      phase: context.phase,
      bones: createGestureBones(context, intensity),
      gaze: createGaze(context, intensity),
      expression: createExpressionState(context, intensity),
      idleSway: 0.04 + intensity * 0.06,
      breathing: 0.015 + intensity * 0.022,
      gestureCycleMs: 1300 - Math.round(context.metadata.energy * 320),
      reactionDecay: 0.16 + context.metadata.energy * 0.1,
    };
  }
}
