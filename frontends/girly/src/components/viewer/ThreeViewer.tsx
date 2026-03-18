/**
 * ThreeViewer – owns the Three.js scene lifecycle and applies the avatar
 * performance layer to a loaded VRM model plus an optional room environment.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { useModel } from '../../context/ModelContext.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import { getAnimationProvider } from '../../providers/registry.ts';
import { type AnimationClip } from '../../providers/types.ts';
import { resolveAvatarPresentation } from '../../services/avatarPerformanceService.ts';
import { type AvatarEmotion } from '../../types/index.ts';
import {
  getIdleSetForDereType,
  getIdlePreset,
  interpolateKeyframes,
  type IdleAnimationPreset,
} from '../../services/idleAnimationLibrary.ts';
import { fetchEnvironmentMetadata } from '../../services/environmentLibraryService.ts';
import ViewerChrome from './ViewerChrome.tsx';
import {
  getEnvironmentStagingProfile,
  getFallbackPoseProfile,
  getGroundingBias,
  resolveConservativeCameraDistance,
  resolveGroundFloorHeight,
} from './viewerTuning.ts';
import {
  type EnvironmentSceneMetadata,
  type EnvironmentSceneProfile,
  type RoomMode,
  type SceneAnchor,
  type SceneHotspot,
} from '../../types/companion.ts';

const FPS_SAMPLE_SIZE = 60;
const meshPrototype = THREE.Mesh.prototype as THREE.Mesh & { raycast: THREE.Mesh['raycast'] };
const geometryPrototype = THREE.BufferGeometry.prototype as THREE.BufferGeometry & {
  computeBoundsTree?: () => void;
  disposeBoundsTree?: () => void;
};
meshPrototype.raycast = acceleratedRaycast;
geometryPrototype.computeBoundsTree = computeBoundsTree;
geometryPrototype.disposeBoundsTree = disposeBoundsTree;

type SupportedBoneName =
  | 'hips'
  | 'head'
  | 'neck'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'chest'
  | 'spine'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot';

type VRMRuntimeHandle = VRM & {
  humanoid?: {
    getRawBoneNode?: (boneName: string) => THREE.Object3D | null;
    getNormalizedBoneNode?: (boneName: string) => THREE.Object3D | null;
  };
  expressionManager?: {
    setValue?: (name: string, value: number) => void;
  };
};

interface RoomState {
  roomMode: RoomMode;
  currentAnchorId: string | null;
  targetAnchorId: string | null;
  currentHotspotId: string | null;
  currentLookTarget: THREE.Vector3 | null;
  lastRoomActionAt: number;
  currentTargetPosition: THREE.Vector3 | null;
}

type CameraMode = 'orbit' | 'freelook';
type AvatarSupportTier = 'full' | 'partial' | 'fallback';
type ViewerNotice = 'freelook' | 'paused' | null;

const BONE_FALLBACK_PATTERNS: Record<SupportedBoneName, RegExp[]> = {
  hips: [/hips/i, /pelvis/i],
  head: [/head/i],
  neck: [/neck/i],
  leftShoulder: [/(left|l)[^a-z0-9]*shoulder/i],
  rightShoulder: [/(right|r)[^a-z0-9]*shoulder/i],
  chest: [/chest/i, /upperchest/i],
  spine: [/spine/i],
  leftUpperArm: [/(left|l)[^a-z0-9]*(upperarm|arm|shoulder)/i, /leftshoulder/i],
  leftLowerArm: [/(left|l)[^a-z0-9]*(lowerarm|forearm)/i],
  rightUpperArm: [/(right|r)[^a-z0-9]*(upperarm|arm|shoulder)/i, /rightshoulder/i],
  rightLowerArm: [/(right|r)[^a-z0-9]*(lowerarm|forearm)/i],
  leftUpperLeg: [/(left|l)[^a-z0-9]*(upperleg|thigh|leg)/i],
  leftLowerLeg: [/(left|l)[^a-z0-9]*(lowerleg|calf|knee)/i],
  leftFoot: [/(left|l)[^a-z0-9]*(foot|ankle)/i],
  rightUpperLeg: [/(right|r)[^a-z0-9]*(upperleg|thigh|leg)/i],
  rightLowerLeg: [/(right|r)[^a-z0-9]*(lowerleg|calf|knee)/i],
  rightFoot: [/(right|r)[^a-z0-9]*(foot|ankle)/i],
};
const boneFallbackCache = new WeakMap<VRM, Partial<Record<SupportedBoneName, THREE.Object3D | null>>>();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function normalizeAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clampAngleAroundBase(targetYaw: number, baseYaw: number, maxOffset: number): number {
  const delta = normalizeAngle(targetYaw - baseYaw);
  return baseYaw + THREE.MathUtils.clamp(delta, -maxOffset, maxOffset);
}

function getBoneNode(vrm: VRM | null, boneName: SupportedBoneName): THREE.Object3D | null {
  if (!vrm) return null;
  const runtime = vrm as VRMRuntimeHandle;
  const normalizedBone = runtime.humanoid?.getNormalizedBoneNode?.(boneName) ?? null;
  if (normalizedBone) return normalizedBone;
  const rawBone = runtime.humanoid?.getRawBoneNode?.(boneName) ?? null;
  if (rawBone) return rawBone;

  let cache = boneFallbackCache.get(vrm);
  if (!cache) {
    cache = {};
    boneFallbackCache.set(vrm, cache);
  }

  if (boneName in cache) {
    return cache[boneName] ?? null;
  }

  const patterns = BONE_FALLBACK_PATTERNS[boneName];
  let fallback: THREE.Object3D | null = null;
  vrm.scene.traverse((child) => {
    if (fallback || !('isBone' in child) || !(child as THREE.Bone).isBone) return;
    if (patterns.some((pattern) => pattern.test(child.name))) {
      fallback = child;
    }
  });

  cache[boneName] = fallback;
  return fallback;
}

function applyBoneRotation(
  vrm: VRM | null,
  boneName: SupportedBoneName,
  targetRotation: [number, number, number],
  factor: number,
): void {
  const bone = getBoneNode(vrm, boneName);
  if (!bone) return;

  bone.rotation.x = lerp(bone.rotation.x, targetRotation[0], factor);
  bone.rotation.y = lerp(bone.rotation.y, targetRotation[1], factor);
  bone.rotation.z = lerp(bone.rotation.z, targetRotation[2], factor);
}

function setExpression(vrm: VRM | null, name: string, value: number): void {
  const runtime = vrm as VRMRuntimeHandle | null;
  runtime?.expressionManager?.setValue?.(name, clamp01(value));
}

/**
 * Emotion-to-BlendShape mapping for automatic expression switching.
 *
 * Each emotion maps to a set of VRM expression weights. Values are blended
 * targets — the render loop lerps toward them at ~200ms equivalent rate.
 */
const EMOTION_EXPRESSION_MAP: Record<AvatarEmotion, Record<string, number>> = {
  neutral: { happy: 0.05, relaxed: 0.15, surprised: 0, angry: 0, sad: 0 },
  warm:    { happy: 0.55, relaxed: 0.35, surprised: 0, angry: 0, sad: 0 },
  excited: { happy: 0.65, relaxed: 0.1,  surprised: 0.3, angry: 0, sad: 0 },
  shy:     { happy: 0.2,  relaxed: 0.1,  surprised: 0.08, angry: 0, sad: 0.15 },
  playful: { happy: 0.5,  relaxed: 0.2,  surprised: 0.12, angry: 0, sad: 0 },
  thoughtful: { happy: 0.08, relaxed: 0.25, surprised: 0.05, angry: 0, sad: 0.05 },
};

/** Smoothing factor per frame at 30fps — equivalent to ~200ms interpolation. */
const EMOTION_LERP_FACTOR = 0.12;

/**
 * Apply emotion-driven BlendShape weights with smooth interpolation.
 * Layered on top of the base animation expressions for additive blending.
 */
function applyEmotionExpression(
  vrm: VRM | null,
  emotion: AvatarEmotion,
  emotionBlendState: Record<string, number>,
): void {
  if (!vrm) return;

  const targets = EMOTION_EXPRESSION_MAP[emotion] ?? EMOTION_EXPRESSION_MAP.neutral;

  for (const [name, target] of Object.entries(targets)) {
    const current = emotionBlendState[name] ?? 0;
    const blended = lerp(current, target, EMOTION_LERP_FACTOR);
    emotionBlendState[name] = blended;
    setExpression(vrm, name, clamp01(blended));
  }
}

function normalizeModelLoadError(message: string): string {
  if (/unexpected token|valid json|json/i.test(message)) {
    return 'That file was imported, but it is not a valid VRM or GLB avatar that AnimeGirly can load.';
  }

  if (/does not contain a valid vrm model/i.test(message)) {
    return 'That file loaded, but it does not contain a valid VRM avatar.';
  }

  if (/failed to fetch|networkerror|404|not found/i.test(message)) {
    return 'AnimeGirly could not find the selected avatar file anymore. Import it again or choose another model.';
  }

  return message;
}

function normalizeRendererInitError(message: string): string {
  if (/webgl context|error creating webgl context|could not create a webgl context/i.test(message)) {
    return '3D rendering is unavailable in this browser session right now. You can keep chatting and try another browser or graphics mode later.';
  }

  return `3D viewer unavailable: ${message}`;
}

/**
 * Module-level state for the library-driven idle animation system.
 *
 * Tracks the active dere-type, resolved base preset, micro-gesture scheduling,
 * and the currently playing micro-gesture.  Stored at module scope because
 * ThreeViewer is a singleton — only one instance runs at a time.
 */
const idleAnimState = {
  /** Last resolved dere-type; used to detect persona changes. */
  dereType: '',
  /** Resolved base posture preset (loops continuously). */
  basePreset: null as IdleAnimationPreset | null,
  /** Pool of micro-gesture IDs available for the current dere-type. */
  microGesturePool: [] as string[],
  /** [min, max] seconds between micro-gesture triggers. */
  microGestureIntervalRange: [10, 20] as [number, number],
  /** Timestamp (ms) at which the next micro-gesture should fire. */
  nextMicroGestureMs: 0,
  /** Currently playing micro-gesture preset, or null if idle. */
  activeMicroGesture: null as IdleAnimationPreset | null,
  /** Timestamp (ms) when the active micro-gesture started. */
  microGestureStartMs: 0,
};

/**
 * Reset module-level idle animation state to defaults.
 *
 * Must be called when swapping VRM models so stale dere-type data,
 * micro-gesture timers, and base presets from the previous avatar
 * don't bleed into the new one.
 */
function resetIdleAnimState(): void {
  idleAnimState.dereType = '';
  idleAnimState.basePreset = null;
  idleAnimState.microGesturePool = [];
  idleAnimState.microGestureIntervalRange = [10, 20];
  idleAnimState.nextMicroGestureMs = 0;
  idleAnimState.activeMicroGesture = null;
  idleAnimState.microGestureStartMs = 0;
}

/**
 * Schedule the next micro-gesture trigger at a random interval from `nowMs`.
 *
 * @param nowMs - Current timestamp in milliseconds.
 */
function scheduleMicroGesture(nowMs: number): void {
  const [minSec, maxSec] = idleAnimState.microGestureIntervalRange;
  idleAnimState.nextMicroGestureMs =
    nowMs + (minSec + Math.random() * (maxSec - minSec)) * 1000;
}

/**
 * Apply idle posture and micro-gestures using the persona-driven animation
 * library, with additive breathing and gaze drift overlays.
 *
 * Replaces the former sine-wave-only idle with per-dere-type keyframe presets
 * from `idleAnimationLibrary.ts`, so a tsundere crosses her arms while a
 * dandere fidgets nervously.
 *
 * Layers (applied in order):
 *   1. Base posture preset (looping keyframe interpolation)
 *   2. Micro-gesture overlay (stochastically triggered, ramped in over 0.3 s)
 *   3. Organic breathing (additive sine on chest/spine)
 *   4. Gaze drift (additive sine on head, reduced by room look weight)
 *   5. Facial expressions (blink, smile, mouth — independent of posture)
 *
 * @param vrm            - The loaded VRM model to animate.
 * @param nowMs          - Current timestamp from requestAnimationFrame.
 * @param moodCarry      - Lingering mood factor in [0, 1].
 * @param settleBlend    - Settle-to-idle blend factor in [0, 1].
 * @param speechBlend    - Speech intensity factor in [0, 1].
 * @param roomLookWeight - Weight for room look target in [0, 1].
 * @param dereType       - Active persona's primary dere-type string.
 */
function applyIdleBaseline(
  vrm: VRM | null,
  nowMs: number,
  moodCarry: number,
  settleBlend: number,
  speechBlend: number,
  roomLookWeight: number,
  dereType: string,
): void {
  if (!vrm) return;

  const seconds = nowMs / 1000;

  // ── Resolve idle set when dere-type changes or on first call ──
  if (dereType !== idleAnimState.dereType || !idleAnimState.basePreset) {
    const idleSet = getIdleSetForDereType(dereType);
    idleAnimState.dereType = dereType;
    idleAnimState.basePreset = getIdlePreset(idleSet.basePresetId) ?? null;
    idleAnimState.microGesturePool = idleSet.microGestureIds;
    idleAnimState.microGestureIntervalRange = idleSet.microGestureIntervalRange;
    idleAnimState.activeMicroGesture = null;
    scheduleMicroGesture(nowMs);
  }

  // ── Layer 1: Base posture from library preset ──
  const basePreset = idleAnimState.basePreset;
  if (basePreset) {
    const baseRotations = interpolateKeyframes(basePreset, seconds);

    for (const [boneName, rotation] of Object.entries(baseRotations)) {
      applyBoneRotation(vrm, boneName as SupportedBoneName, rotation, 0.1);
    }

    // Apply the preset's BlendShape defaults (e.g. tsundere neutral face)
    if (basePreset.blendShapes) {
      for (const [name, weight] of Object.entries(basePreset.blendShapes)) {
        setExpression(vrm, name, weight);
      }
    }
  }

  // ── Layer 2: Micro-gesture triggering & overlay ──
  if (
    !idleAnimState.activeMicroGesture &&
    idleAnimState.microGesturePool.length > 0 &&
    nowMs >= idleAnimState.nextMicroGestureMs
  ) {
    const pool = idleAnimState.microGesturePool;
    const randomId = pool[Math.floor(Math.random() * pool.length)];
    idleAnimState.activeMicroGesture = getIdlePreset(randomId) ?? null;
    idleAnimState.microGestureStartMs = nowMs;
  }

  if (idleAnimState.activeMicroGesture) {
    const gesture = idleAnimState.activeMicroGesture;
    const elapsedSec = (nowMs - idleAnimState.microGestureStartMs) / 1000;

    if (elapsedSec >= gesture.duration) {
      // Gesture complete — clear and schedule next
      idleAnimState.activeMicroGesture = null;
      scheduleMicroGesture(nowMs);
    } else {
      // Ramp-in over 0.3 s for smooth entry; keyframes handle the return
      const RAMP_IN_SEC = 0.3;
      const rampFactor = clamp01(
        elapsedSec < RAMP_IN_SEC ? elapsedSec / RAMP_IN_SEC : 1,
      );

      const gestureRotations = interpolateKeyframes(gesture, elapsedSec);
      for (const [boneName, rotation] of Object.entries(gestureRotations)) {
        applyBoneRotation(
          vrm,
          boneName as SupportedBoneName,
          rotation,
          0.15 * rampFactor,
        );
      }

      // Gesture BlendShape accents (e.g. slight angry for a huff)
      if (gesture.blendShapes) {
        for (const [name, weight] of Object.entries(gesture.blendShapes)) {
          setExpression(vrm, name, weight * rampFactor);
        }
      }
    }
  }

  // ── Layer 3: Organic breathing overlay (additive, always active) ──
  const breathing = Math.sin(seconds * 1.9) * 0.015;
  const chestBone = getBoneNode(vrm, 'chest');
  if (chestBone) chestBone.rotation.x += breathing * 0.9;
  const spineBone = getBoneNode(vrm, 'spine');
  if (spineBone) spineBone.rotation.x += breathing * 0.5;

  // ── Layer 4: Gaze drift (reduced when looking at room target) ──
  const gazeDrift =
    Math.sin(seconds * 0.48 + Math.PI / 3) * 0.06 * (1 - roomLookWeight * 0.5);
  const headBone = getBoneNode(vrm, 'head');
  if (headBone) headBone.rotation.y += gazeDrift;

  // ── Layer 5: Facial expressions (blink, smile, mouth) ──
  const smile = clamp01(0.08 + moodCarry * 0.22 + settleBlend * 0.18);
  const relaxed = clamp01(0.26 + moodCarry * 0.18);
  const blinkPulse = Math.sin(seconds * 0.75) * 0.5 + 0.5;
  const blinkAmount = blinkPulse > 0.992 ? 1 : 0;
  const mouthOpen = clamp01(
    speechBlend * 0.55 * (Math.sin(seconds * 8.5) * 0.5 + 0.5),
  );

  setExpression(vrm, 'happy', smile);
  setExpression(vrm, 'relaxed', relaxed);
  setExpression(vrm, 'blink', blinkAmount);
  setExpression(vrm, 'aa', mouthOpen);
  setExpression(vrm, 'ih', clamp01(mouthOpen * 0.55));
  setExpression(vrm, 'ou', clamp01(mouthOpen * 0.32));
}

function applyAvatarPerformance(
  vrm: VRM | null,
  clip: AnimationClip | null,
  nowMs: number,
  speechBlend: number,
  reactionBlend: number,
  settleBlend: number,
  moodCarry: number,
  speechEnergyBoost: number,
): void {
  if (!vrm || !clip) return;

  const seconds = nowMs / 1000;
  const breathing = Math.sin(seconds * 2.1) * clip.breathing;
  const idleSway = Math.sin(seconds * 1.35) * clip.idleSway;
  const gesturePulse = (Math.sin((nowMs / clip.gestureCycleMs) * Math.PI * 2) * 0.5 + 0.5) * reactionBlend;
  const blinkPulse = Math.sin(seconds * clip.expression.blinkRate) * 0.5 + 0.5;
  const blinkAmount = blinkPulse > 0.97 ? 1 : 0;
  const talkPulse = speechBlend > 0
    ? (Math.sin(seconds * (7 + clip.expression.mouthOpen * 8)) * 0.5 + 0.5)
    : 0;
  const mouthOpen = clamp01(
    clip.expression.mouthOpen * talkPulse * (0.45 + speechBlend * 0.75) +
    reactionBlend * 0.04,
  );
  const smile = clamp01(clip.expression.smile + reactionBlend * 0.22 + moodCarry * 0.12);
  const relaxed = clamp01(0.12 + moodCarry * 0.18 + settleBlend * 0.2);
  const surprised = clamp01(reactionBlend * 0.55 + clip.expression.brows * 0.16);
  const brow = clamp01(clip.expression.brows + settleBlend * 0.08);

  const headBase = clip.bones.head?.rotation ?? [0, 0, 0];
  const neckBase = clip.bones.neck?.rotation ?? [0, 0, 0];
  const chestBase = clip.bones.chest?.rotation ?? [0, 0, 0];
  const spineBase = clip.bones.spine?.rotation ?? [0, 0, 0];
  const skipClipDrivenArmBones = new Set<SupportedBoneName>([
    'leftUpperArm',
    'leftLowerArm',
    'rightUpperArm',
    'rightLowerArm',
  ]);

  applyBoneRotation(vrm, 'head', [
    headBase[0] + clip.gaze.pitch + breathing * (0.4 + speechEnergyBoost * 0.15) + gesturePulse * 0.03,
    headBase[1] + clip.gaze.yaw + idleSway * 0.65,
    headBase[2] + settleBlend * -0.02,
  ], 0.16);
  applyBoneRotation(vrm, 'neck', [
    neckBase[0] + breathing * 0.28,
    neckBase[1] + clip.gaze.yaw * 0.55 + idleSway * 0.2,
    neckBase[2],
  ], 0.14);
  applyBoneRotation(vrm, 'chest', [
    chestBase[0] + breathing * (1 + speechEnergyBoost * 0.1),
    chestBase[1] + idleSway * 0.18,
    chestBase[2],
  ], 0.1);
  applyBoneRotation(vrm, 'spine', [
    spineBase[0] + breathing * 0.55,
    spineBase[1] + idleSway * 0.12,
    spineBase[2],
  ], 0.08);
  applyBoneRotation(vrm, 'leftShoulder', [0.04, 0.01, -0.03], 0.26);
  applyBoneRotation(vrm, 'rightShoulder', [0.04, -0.01, 0.03], 0.26);

  for (const [boneName, pose] of Object.entries(clip.bones)) {
    if (boneName === 'head' || boneName === 'neck' || boneName === 'chest' || boneName === 'spine') {
      continue;
    }

    const typedBoneName = boneName as SupportedBoneName;
    if (skipClipDrivenArmBones.has(typedBoneName)) {
      continue;
    }
    const weight = pose.weight ?? 1;
    const waveOffset =
      typedBoneName.includes('Arm')
        ? gesturePulse * (0.12 + speechEnergyBoost * 0.04) * weight
        : gesturePulse * 0.06 * weight;

    applyBoneRotation(vrm, typedBoneName, [
      pose.rotation[0] + waveOffset,
      pose.rotation[1],
      pose.rotation[2],
    ], 0.14);
  }
  setExpression(vrm, 'happy', smile);
  setExpression(vrm, 'relaxed', relaxed);
  setExpression(vrm, 'surprised', surprised);
  setExpression(vrm, 'blink', blinkAmount);
  setExpression(vrm, 'aa', mouthOpen);
  setExpression(vrm, 'ih', clamp01(mouthOpen * (0.55 + clip.expression.mouthSpread * 0.35)));
  setExpression(vrm, 'ou', clamp01(mouthOpen * (0.45 - brow * 0.12 + clip.expression.mouthSpread * 0.1)));
  applyArmPoseClamp(vrm, 0.06 + settleBlend * 0.03);
}

function disposeSceneObject(root: THREE.Object3D | null): void {
  if (!root) return;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & {
      geometry?: THREE.BufferGeometry & { disposeBoundsTree?: () => void };
      material?: THREE.Material | THREE.Material[];
    };
    mesh.geometry?.disposeBoundsTree?.();
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material?.dispose?.();
    }
  });
}

function inferEnvironmentMetadata(
  root: THREE.Object3D,
  currentEnvironment: EnvironmentSceneProfile,
  collisionMeshes: THREE.Mesh[],
  baseFloorY: number,
): EnvironmentSceneMetadata {
  const stagingProfile = getEnvironmentStagingProfile(currentEnvironment.category);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const dominantAxis = size.x >= size.z ? 'x' : 'z';
  const longSpan = dominantAxis === 'x' ? size.x : size.z;
  const shortSpan = dominantAxis === 'x' ? size.z : size.x;
  const axisVector = dominantAxis === 'x'
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 0, 1);
  const orthogonalVector = dominantAxis === 'x'
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const floorY = baseFloorY;
  const preferredAnchor = center
    .clone()
    .sub(axisVector.clone().multiplyScalar(Math.max(0.28, Math.min(longSpan * stagingProfile.anchorAxisBias, 1.1))))
    .add(orthogonalVector.clone().multiplyScalar(Math.max(-0.36, Math.min(shortSpan * stagingProfile.anchorSideBias, 0.36))));
  const anchorOffset = axisVector.clone().multiplyScalar(Math.max(0.28, Math.min(longSpan * 0.08, 0.8)));
  const anchorPosition = findConservativeAnchorPosition(collisionMeshes, bounds, floorY, preferredAnchor)
    ?? center.clone().sub(anchorOffset);
  const anchorToCenter = center.clone().sub(anchorPosition).setY(0);
  if (anchorToCenter.lengthSq() < 0.001) {
    anchorToCenter.copy(axisVector).multiplyScalar(-1);
  } else {
    anchorToCenter.normalize();
  }
  const cameraDirection = anchorToCenter.clone().multiplyScalar(-1);
  const cameraDistance = Math.max(
    stagingProfile.cameraDistanceMin,
    Math.min(longSpan * stagingProfile.cameraDistanceScale, stagingProfile.cameraDistanceMax),
  );
  const cameraOpenness = measureOpenDistance(
    collisionMeshes,
    new THREE.Vector3(anchorPosition.x, floorY + 1.12, anchorPosition.z),
    cameraDirection.clone().normalize(),
    Math.max(cameraDistance + 0.6, stagingProfile.cameraDistanceMax + 0.4),
  );
  const resolvedCameraDistance = resolveConservativeCameraDistance(cameraDistance, cameraOpenness);
  const sideBias = orthogonalVector
    .clone()
    .multiplyScalar(Math.max(stagingProfile.sideBiasMin, Math.min(shortSpan * stagingProfile.sideBiasScale, stagingProfile.sideBiasMax)));
  const cameraPosition = anchorPosition
    .clone()
    .add(cameraDirection.multiplyScalar(resolvedCameraDistance))
    .add(sideBias);
  const freeLookSpawn = anchorPosition
    .clone()
    .add(cameraDirection.clone().multiplyScalar(Math.max(0.92, Math.min(resolvedCameraDistance * 0.74, 1.65))));
  const xMargin = Math.max(0.55, size.x * 0.08);
  const zMargin = Math.max(0.55, size.z * 0.08);
  cameraPosition.x = THREE.MathUtils.clamp(cameraPosition.x, bounds.min.x + xMargin, bounds.max.x - xMargin);
  cameraPosition.z = THREE.MathUtils.clamp(cameraPosition.z, bounds.min.z + zMargin, bounds.max.z - zMargin);
  freeLookSpawn.x = THREE.MathUtils.clamp(freeLookSpawn.x, bounds.min.x + xMargin, bounds.max.x - xMargin);
  freeLookSpawn.z = THREE.MathUtils.clamp(freeLookSpawn.z, bounds.min.z + zMargin, bounds.max.z - zMargin);
  const targetPosition = anchorPosition.clone();
  targetPosition.y = floorY + Math.max(
    stagingProfile.targetHeightMin,
    Math.min(size.y * stagingProfile.targetHeightScale, stagingProfile.targetHeightMax),
  );
  const avatarFacingYaw = Math.atan2(
    cameraPosition.x - anchorPosition.x,
    cameraPosition.z - anchorPosition.z,
  );
  const walkBounds = {
    min: [
      bounds.min.x + Math.max(0.65, size.x * stagingProfile.walkInsetX),
      bounds.min.z + Math.max(0.65, size.z * stagingProfile.walkInsetZ),
    ] as [number, number],
    max: [
      bounds.max.x - Math.max(0.65, size.x * stagingProfile.walkInsetX),
      bounds.max.z - Math.max(0.85, size.z * stagingProfile.walkInsetZ),
    ] as [number, number],
  };
  const anchorSeedPositions = [
    anchorPosition.clone(),
    anchorPosition.clone().add(orthogonalVector.clone().multiplyScalar(Math.max(0.45, Math.min(shortSpan * 0.16, 1.1)))),
    anchorPosition.clone().add(axisVector.clone().multiplyScalar(Math.max(0.55, Math.min(longSpan * 0.14, 1.2)))),
    anchorPosition.clone().add(orthogonalVector.clone().multiplyScalar(-Math.max(0.45, Math.min(shortSpan * 0.16, 1.1)))),
  ];
  const anchors: SceneAnchor[] = [];
  const usedPositions: THREE.Vector2[] = [];
  anchorSeedPositions.forEach((candidate, index) => {
    const resolvedCandidate = findConservativeAnchorPosition(collisionMeshes, bounds, floorY, candidate) ?? candidate.clone();
    resolvedCandidate.x = THREE.MathUtils.clamp(resolvedCandidate.x, walkBounds.min[0], walkBounds.max[0]);
    resolvedCandidate.z = THREE.MathUtils.clamp(resolvedCandidate.z, walkBounds.min[1], walkBounds.max[1]);
    const candidateScore = scoreAnchorPosition(collisionMeshes, bounds, floorY, resolvedCandidate.x, resolvedCandidate.z);
    if (!Number.isFinite(candidateScore)) return;
    const currentFloorY = sampleFloorHeight(collisionMeshes, bounds, floorY, resolvedCandidate.x, resolvedCandidate.z);
    if (usedPositions.some((position) => position.distanceTo(new THREE.Vector2(resolvedCandidate.x, resolvedCandidate.z)) < 0.9)) {
      return;
    }
    anchors.push({
      id: index === 0 ? 'anchor-primary' : `anchor-${index + 1}`,
      position: [resolvedCandidate.x, currentFloorY, resolvedCandidate.z],
      rotationY: avatarFacingYaw,
      pose: stagingProfile.defaultPose,
      personaBiasTags: [
        index === 0 ? 'default' : 'curious',
        currentEnvironment.category,
        currentEnvironment.category === 'bedroom' ? 'calm' : 'social',
      ],
    });
    usedPositions.push(new THREE.Vector2(resolvedCandidate.x, resolvedCandidate.z));
  });
  if (anchors.length === 0) {
    anchors.push({
      id: 'anchor-primary',
      position: [anchorPosition.x, floorY, anchorPosition.z],
      rotationY: avatarFacingYaw,
      pose: stagingProfile.defaultPose,
      personaBiasTags: ['calm', currentEnvironment.category, 'default'],
    });
  }

  const hotspots: SceneHotspot[] = [
    {
      id: 'hotspot-room-center',
      position: [center.x, floorY + 1.1, center.z],
      lookAt: [center.x, floorY + 1.1, center.z],
      label: 'Room center',
      curiosityWeight: 0.65,
      tags: ['all'],
    },
    {
      id: 'hotspot-side',
      position: [center.x + orthogonalVector.x * Math.max(0.55, Math.min(shortSpan * 0.22, 1.2)), floorY + 1.1, center.z + orthogonalVector.z * Math.max(0.55, Math.min(shortSpan * 0.22, 1.2))],
      lookAt: [center.x + orthogonalVector.x * Math.max(0.55, Math.min(shortSpan * 0.22, 1.2)), floorY + 1.1, center.z + orthogonalVector.z * Math.max(0.55, Math.min(shortSpan * 0.22, 1.2))],
      label: 'Side of the room',
      curiosityWeight: 0.48,
      tags: ['curious'],
    },
    {
      id: 'hotspot-front',
      position: [
        center.x + axisVector.x * Math.max(0.8, Math.min(longSpan * 0.24, 1.8)),
        floorY + 1.08,
        center.z + axisVector.z * Math.max(0.8, Math.min(longSpan * 0.24, 1.8)),
      ],
      lookAt: [
        center.x + axisVector.x * Math.max(0.8, Math.min(longSpan * 0.24, 1.8)),
        floorY + 1.08,
        center.z + axisVector.z * Math.max(0.8, Math.min(longSpan * 0.24, 1.8)),
      ],
      label: currentEnvironment.category === 'bedroom' ? 'Window side' : 'Front of the room',
      curiosityWeight: currentEnvironment.category === 'bedroom' ? 0.34 : 0.56,
      tags: currentEnvironment.category === 'bedroom' ? ['calm'] : ['curious', 'social'],
    },
  ];

  return {
    anchors,
    hotspots,
      lookTargets: hotspots.map((hotspot) => ({
        id: hotspot.id,
        position: hotspot.lookAt,
        label: hotspot.label,
      })),
    walkBounds,
    credits: currentEnvironment.credits ?? [],
    spawnOffsetY: stagingProfile.spawnOffsetY,
    roamPreset: stagingProfile.roamPreset,
    roamEnabled: anchors.length > 1 && stagingProfile.roamEnabled,
    cameraPreset: {
      position: [cameraPosition.x, floorY + Math.max(1.32, size.y * 0.19), cameraPosition.z],
      target: [targetPosition.x, floorY + 1.08, targetPosition.z],
      freeLookSpawn: [freeLookSpawn.x, floorY + 1.32, freeLookSpawn.z],
      fov: currentEnvironment.category === 'bedroom' ? 30 : currentEnvironment.category === 'classroom' ? 31 : 29,
    },
  };
}

function normalizeEnvironmentMetadata(
  metadata: EnvironmentSceneMetadata,
  root: THREE.Object3D,
  currentEnvironment: EnvironmentSceneProfile,
  collisionMeshes: THREE.Mesh[],
  baseFloorY: number,
): EnvironmentSceneMetadata {
  const fallback = inferEnvironmentMetadata(root, currentEnvironment, collisionMeshes, baseFloorY);
  const sceneBounds = new THREE.Box3().setFromObject(root);
  const explicitMetadataAnchorCount = metadata.anchors?.length ?? 0;
  const hasExplicitCameraPreset = Boolean(metadata.cameraPreset);
  const metadataAnchors = explicitMetadataAnchorCount ? metadata.anchors as SceneAnchor[] : fallback.anchors;
  let anchors = metadataAnchors;
  const walkBounds = ensureWalkBoundsContainAnchors(metadata.walkBounds ?? fallback.walkBounds, metadataAnchors);
  const hotspots = metadata.hotspots?.length ? metadata.hotspots : fallback.hotspots;
  const lookTargets = metadata.lookTargets?.length ? metadata.lookTargets : fallback.lookTargets;
  let cameraPreset = {
    ...fallback.cameraPreset,
    ...metadata.cameraPreset,
    freeLookSpawn: metadata.cameraPreset?.freeLookSpawn ?? fallback.cameraPreset?.freeLookSpawn,
    fov: metadata.cameraPreset?.fov ?? fallback.cameraPreset?.fov,
  };

  const currentPrimaryAnchor = metadataAnchors[0] ?? null;
  const fallbackPrimaryAnchor = fallback.anchors[0] ?? null;
  const shouldPreferFallbackStaging = currentEnvironment.source === 'local-library'
    && explicitMetadataAnchorCount <= 1
    && ['bedroom', 'living-room', 'interior', 'office'].includes(currentEnvironment.category)
    && (Boolean(metadata.cameraPreset) || explicitMetadataAnchorCount > 0);

  if (shouldPreferFallbackStaging && fallbackPrimaryAnchor) {
    anchors = [fallbackPrimaryAnchor, ...metadataAnchors.slice(1)];
    if (!hasExplicitCameraPreset) {
      cameraPreset = fallback.cameraPreset ?? cameraPreset;
    }
  }

  if (currentPrimaryAnchor && fallbackPrimaryAnchor) {
    const currentScore = scoreAnchorPosition(
      collisionMeshes,
      sceneBounds,
      metadata.baseFloorYOverride ?? baseFloorY,
      currentPrimaryAnchor.position[0],
      currentPrimaryAnchor.position[2],
    );
    const fallbackScore = scoreAnchorPosition(
      collisionMeshes,
      sceneBounds,
      metadata.baseFloorYOverride ?? baseFloorY,
      fallbackPrimaryAnchor.position[0],
      fallbackPrimaryAnchor.position[2],
    );

    if (
      !Number.isFinite(currentScore)
      || (Number.isFinite(fallbackScore) && currentScore < fallbackScore * 0.88)
    ) {
      anchors = [fallbackPrimaryAnchor, ...metadataAnchors.slice(1)];
      if (!hasExplicitCameraPreset) {
        cameraPreset = fallback.cameraPreset ?? cameraPreset;
      }
    }
  }

  return {
    ...fallback,
    ...metadata,
    anchors,
    hotspots,
    lookTargets,
    walkBounds,
    roamEnabled: metadata.roamEnabled ?? (anchors.length > 1),
    cameraPreset,
  };
}

function ensureWalkBoundsContainAnchors(
  walkBounds: EnvironmentSceneMetadata['walkBounds'] | undefined,
  anchors: SceneAnchor[],
): EnvironmentSceneMetadata['walkBounds'] | undefined {
  if (!walkBounds || anchors.length === 0) return walkBounds;

  let minX = walkBounds.min[0];
  let minZ = walkBounds.min[1];
  let maxX = walkBounds.max[0];
  let maxZ = walkBounds.max[1];

  for (const anchor of anchors) {
    minX = Math.min(minX, anchor.position[0] - 0.45);
    minZ = Math.min(minZ, anchor.position[2] - 0.45);
    maxX = Math.max(maxX, anchor.position[0] + 0.45);
    maxZ = Math.max(maxZ, anchor.position[2] + 0.45);
  }

  return {
    min: [minX, minZ],
    max: [maxX, maxZ],
  };
}

function getCollisionMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & { geometry?: THREE.BufferGeometry & { computeBoundsTree?: () => void } };
    if (!('isMesh' in mesh) || !mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundsTree?.();
    meshes.push(mesh);
  });
  return meshes;
}

function sampleFloorHeight(
  collisionMeshes: THREE.Mesh[],
  sceneBounds: THREE.Box3 | null,
  baseFloorY: number,
  x: number,
  z: number,
): number {
  if (!sceneBounds || collisionMeshes.length === 0) return baseFloorY;
  const origin = new THREE.Vector3(x, sceneBounds.max.y + 3, z);
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, sceneBounds.max.y - sceneBounds.min.y + 8);
  const intersections = raycaster.intersectObjects(collisionMeshes, false);
  const tolerance = Math.max(0.16, sceneBounds.getSize(new THREE.Vector3()).y * 0.03);
  const floorHits = intersections
    .filter((hit) => (
      Math.abs(hit.face?.normal.y ?? 0) > 0.8 &&
      Math.abs(hit.point.y - baseFloorY) <= tolerance
    ))
    .sort((left, right) => {
      const leftDelta = Math.abs(left.point.y - baseFloorY);
      const rightDelta = Math.abs(right.point.y - baseFloorY);
      if (leftDelta === rightDelta) {
        return left.point.y - right.point.y;
      }
      return leftDelta - rightDelta;
    });

  return floorHits[0]?.point.y ?? baseFloorY;
}

function computeBaseFloorHeight(
  collisionMeshes: THREE.Mesh[],
  sceneBounds: THREE.Box3 | null,
): number {
  if (!sceneBounds || collisionMeshes.length === 0) return 0;

  const size = sceneBounds.getSize(new THREE.Vector3());
  const xMargin = Math.max(0.35, size.x * 0.08);
  const zMargin = Math.max(0.35, size.z * 0.08);
  const hits: number[] = [];

  for (let gx = 0; gx < 5; gx += 1) {
    for (let gz = 0; gz < 5; gz += 1) {
      const x = THREE.MathUtils.lerp(sceneBounds.min.x + xMargin, sceneBounds.max.x - xMargin, gx / 4);
      const z = THREE.MathUtils.lerp(sceneBounds.min.z + zMargin, sceneBounds.max.z - zMargin, gz / 4);
      const origin = new THREE.Vector3(x, sceneBounds.max.y + 3, z);
      const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, sceneBounds.max.y - sceneBounds.min.y + 8);
      const intersections = raycaster.intersectObjects(collisionMeshes, false);
      intersections.forEach((hit) => {
        if (Math.abs(hit.face?.normal.y ?? 0) < 0.82) return;
        if (hit.point.y > sceneBounds.min.y + size.y * 0.45) return;
        hits.push(hit.point.y);
      });
    }
  }

  if (hits.length === 0) return sceneBounds.min.y;

  const bins = new Map<number, number>();
  const binSize = Math.max(0.08, size.y * 0.015);
  hits.forEach((height) => {
    const bucket = Math.round(height / binSize);
    bins.set(bucket, (bins.get(bucket) ?? 0) + 1);
  });

  let bestBucket = Math.round(sceneBounds.min.y / binSize);
  let bestScore = -Infinity;
  for (const [bucket, count] of bins.entries()) {
    const bucketHeight = bucket * binSize;
    const lowBias = 1 - Math.min(1, Math.max(0, (bucketHeight - sceneBounds.min.y) / Math.max(0.001, size.y * 0.45)));
    const score = count * 4 + lowBias;
    if (score > bestScore) {
      bestScore = score;
      bestBucket = bucket;
    }
  }

  return bestBucket * binSize;
}

function measureOpenDistance(
  collisionMeshes: THREE.Mesh[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): number {
  if (collisionMeshes.length === 0) return maxDistance;
  const raycaster = new THREE.Raycaster(origin, direction, 0.1, maxDistance);
  const hits = raycaster.intersectObjects(collisionMeshes, false);
  return hits[0]?.distance ?? maxDistance;
}

function findConservativeAnchorPosition(
  collisionMeshes: THREE.Mesh[],
  sceneBounds: THREE.Box3,
  baseFloorY: number,
  preferredPosition?: THREE.Vector3 | null,
): THREE.Vector3 | null {
  if (collisionMeshes.length === 0) return null;

  const size = sceneBounds.getSize(new THREE.Vector3());
  const center = sceneBounds.getCenter(new THREE.Vector3());
  const xMargin = Math.max(0.7, size.x * 0.16);
  const zMargin = Math.max(0.7, size.z * 0.16);
  const minX = sceneBounds.min.x + xMargin;
  const maxX = sceneBounds.max.x - xMargin;
  const minZ = sceneBounds.min.z + zMargin;
  const maxZ = sceneBounds.max.z - zMargin;

  if (minX >= maxX || minZ >= maxZ) return center.clone().setY(baseFloorY);

  let bestCandidate: THREE.Vector3 | null = null;
  let bestScore = -Infinity;
  const maxDistance = Math.max(1.4, Math.min(Math.max(size.x, size.z) * 0.22, 2.8));

  for (let gx = 0; gx < 5; gx += 1) {
    for (let gz = 0; gz < 5; gz += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, gx / 4);
      const z = THREE.MathUtils.lerp(minZ, maxZ, gz / 4);
      const floorY = sampleFloorHeight(collisionMeshes, sceneBounds, baseFloorY, x, z);
      if (Math.abs(floorY - baseFloorY) > Math.max(0.18, size.y * 0.03)) continue;

      const origin = new THREE.Vector3(x, floorY + 1.05, z);
      const openness =
        measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(1, 0, 0), maxDistance) +
        measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(-1, 0, 0), maxDistance) +
        measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(0, 0, 1), maxDistance) +
        measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(0, 0, -1), maxDistance);
      const centerDistance = new THREE.Vector2(x - center.x, z - center.z).length();
      const preferredDistance = preferredPosition
        ? new THREE.Vector2(x - preferredPosition.x, z - preferredPosition.z).length()
        : centerDistance;
      const score = openness - preferredDistance * 0.24 - centerDistance * 0.06;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = new THREE.Vector3(x, floorY, z);
      }
    }
  }

  return bestCandidate;
}

function isPathBlocked(collisionMeshes: THREE.Mesh[], start: THREE.Vector3, end: THREE.Vector3): boolean {
  if (collisionMeshes.length === 0) return false;
  const direction = new THREE.Vector3().subVectors(end, start);
  const distance = direction.length();
  if (distance < 0.15) return false;
  direction.normalize();
  const raycaster = new THREE.Raycaster(start.clone().setY(start.y + 1), direction, 0.1, distance);
  const hits = raycaster.intersectObjects(collisionMeshes, false);
  return hits.some((hit) => hit.distance < distance - 0.1 && Math.abs(hit.face?.normal.y ?? 0) < 0.85);
}

function clampAvatarToWalkBounds(
  position: THREE.Vector3,
  metadata: EnvironmentSceneMetadata | null,
  sceneBounds: THREE.Box3 | null,
): void {
  if (metadata?.walkBounds) {
    position.x = THREE.MathUtils.clamp(position.x, metadata.walkBounds.min[0], metadata.walkBounds.max[0]);
    position.z = THREE.MathUtils.clamp(position.z, metadata.walkBounds.min[1], metadata.walkBounds.max[1]);
    return;
  }

  if (!sceneBounds) return;

  const xMargin = Math.max(0.45, sceneBounds.getSize(new THREE.Vector3()).x * 0.12);
  const zMargin = Math.max(0.65, sceneBounds.getSize(new THREE.Vector3()).z * 0.14);
  position.x = THREE.MathUtils.clamp(position.x, sceneBounds.min.x + xMargin, sceneBounds.max.x - xMargin);
  position.z = THREE.MathUtils.clamp(position.z, sceneBounds.min.z + zMargin, sceneBounds.max.z - zMargin);
}

function scoreAnchorPosition(
  collisionMeshes: THREE.Mesh[],
  sceneBounds: THREE.Box3 | null,
  baseFloorY: number,
  x: number,
  z: number,
): number {
  if (!sceneBounds || collisionMeshes.length === 0) return Number.NEGATIVE_INFINITY;

  const size = sceneBounds.getSize(new THREE.Vector3());
  const floorY = sampleFloorHeight(collisionMeshes, sceneBounds, baseFloorY, x, z);
  if (Math.abs(floorY - baseFloorY) > Math.max(0.18, size.y * 0.03)) {
    return Number.NEGATIVE_INFINITY;
  }

  const origin = new THREE.Vector3(x, floorY + 1.05, z);
  const maxDistance = Math.max(1.25, Math.min(Math.max(size.x, size.z) * 0.22, 2.8));
  return (
    measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(1, 0, 0), maxDistance) +
    measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(-1, 0, 0), maxDistance) +
    measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(0, 0, 1), maxDistance) +
    measureOpenDistance(collisionMeshes, origin, new THREE.Vector3(0, 0, -1), maxDistance)
  );
}

function applyFallbackRelaxedPose(
  vrm: VRM | null,
  factor: number,
  supportTier: AvatarSupportTier = 'partial',
): void {
  if (!vrm) return;

  const profile = getFallbackPoseProfile(supportTier);
  (Object.entries(profile.relaxedPose) as Array<[SupportedBoneName, [number, number, number]]>).forEach(([boneName, rotation]) => {
    applyBoneRotation(vrm, boneName, rotation, factor);
  });
}

function applyArmPoseClamp(
  vrm: VRM | null,
  factor: number,
  supportTier: AvatarSupportTier = 'partial',
): void {
  if (!vrm) return;

  const profile = getFallbackPoseProfile(supportTier);
  (Object.entries(profile.armClamp) as Array<[SupportedBoneName, [number, number, number]]>).forEach(([boneName, rotation]) => {
    applyBoneRotation(vrm, boneName, rotation, factor);
  });
}

function resolveGroundReferenceY(vrm: VRM | null): number | null {
  if (!vrm) return null;

  vrm.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const boundsMinY = bounds.min.y;
  const avatarHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
  const referenceBones = [
    getBoneNode(vrm, 'leftFoot'),
    getBoneNode(vrm, 'rightFoot'),
    getBoneNode(vrm, 'leftLowerLeg'),
    getBoneNode(vrm, 'rightLowerLeg'),
  ].filter((bone): bone is THREE.Object3D => Boolean(bone));

  const boneHeights = referenceBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y);
  if (boneHeights.length === 0) return boundsMinY;

  const boneMinY = Math.min(...boneHeights);
  const delta = Math.abs(boneMinY - boundsMinY);
  const plausibleFootPivotGap = Math.max(0.06, avatarHeight * 0.022);
  const obviousRenderableOutlierGap = Math.max(0.18, avatarHeight * 0.065);

  if (delta <= plausibleFootPivotGap) return boundsMinY;
  if (delta >= obviousRenderableOutlierGap) {
    return boneMinY - plausibleFootPivotGap;
  }

  const estimatedSoleY = boneMinY - plausibleFootPivotGap * 0.65;
  return THREE.MathUtils.lerp(boundsMinY, estimatedSoleY, 0.24);
}

function placeAvatarOnSampledFloor(
  vrm: VRM | null,
  collisionMeshes: THREE.Mesh[],
  sceneBounds: THREE.Box3 | null,
  metadata: EnvironmentSceneMetadata | null,
  baseFloorY: number,
  x: number,
  z: number,
  authoredFloorHeight?: number | null,
): number {
  if (!vrm) return baseFloorY;

  const nextPosition = new THREE.Vector3(x, 0, z);
  clampAvatarToWalkBounds(nextPosition, metadata, sceneBounds);
  const floorHeight = sampleFloorHeight(
    collisionMeshes,
    sceneBounds,
    metadata?.baseFloorYOverride ?? baseFloorY,
    nextPosition.x,
    nextPosition.z,
  );
  const resolvedFloorHeight = resolveGroundFloorHeight(floorHeight, authoredFloorHeight);
  const spawnOffsetY = metadata?.spawnOffsetY ?? 0;
  vrm.scene.position.set(
    nextPosition.x,
    resolvedFloorHeight + spawnOffsetY,
    nextPosition.z,
  );
  snapAvatarToFloor(vrm, resolvedFloorHeight + spawnOffsetY);
  return resolvedFloorHeight;
}

function resolveAvatarSupportTier(vrm: VRM): AvatarSupportTier {
  const requiredFull: SupportedBoneName[] = [
    'hips',
    'spine',
    'chest',
    'head',
    'leftUpperArm',
    'leftLowerArm',
    'rightUpperArm',
    'rightLowerArm',
    'leftUpperLeg',
    'rightUpperLeg',
  ];
  const requiredPartial: SupportedBoneName[] = [
    'hips',
    'head',
    'leftUpperArm',
    'rightUpperArm',
  ];

  const hasFull = requiredFull.every((boneName) => Boolean(getBoneNode(vrm, boneName)));
  if (hasFull) return 'full';

  const hasPartial = requiredPartial.every((boneName) => Boolean(getBoneNode(vrm, boneName)));
  return hasPartial ? 'partial' : 'fallback';
}

function snapAvatarToFloor(vrm: VRM | null, floorHeight: number): void {
  if (!vrm) return;

  const preferredGroundPoint = resolveGroundReferenceY(vrm);
  if (preferredGroundPoint === null) return;
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const avatarHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
  const groundingBias = getGroundingBias(avatarHeight);
  const correction = floorHeight - preferredGroundPoint - groundingBias;

  if (Number.isFinite(correction) && Math.abs(correction) > 0.0001) {
    vrm.scene.position.y += correction;
    vrm.scene.updateMatrixWorld(true);
  }
}

function getPersonaMotionProfile(persona: ReturnType<typeof useCompanion>['activePersona']) {
  const archetype = persona?.archetype ?? 'custom';
  if (archetype === 'kuudere' || archetype === 'onee-san' || archetype === 'dandere') {
    return {
      speechEnergy: 0.55,
      roamIntervalMs: 12000,
      roamProbability: 0.18,
      lookProbability: 0.45,
      preferStationary: true,
    };
  }

  if (archetype === 'genki' || archetype === 'deredere') {
    return {
      speechEnergy: 1,
      roamIntervalMs: 7000,
      roamProbability: 0.55,
      lookProbability: 0.72,
      preferStationary: false,
    };
  }

  return {
    speechEnergy: 0.78,
    roamIntervalMs: 9500,
    roamProbability: 0.34,
    lookProbability: 0.58,
    preferStationary: false,
  };
}

function syncFreeLookOrientationFromCamera(camera: THREE.Camera, state: {
  yaw: number;
  pitch: number;
}) {
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  state.yaw = euler.y;
  state.pitch = euler.x;
}

export default function ThreeViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const slowTickTimeoutRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const currentVrmRef = useRef<VRM | null>(null);
  const avatarSupportTierRef = useRef<AvatarSupportTier>('fallback');
  const environmentRootRef = useRef<THREE.Object3D | null>(null);
  const environmentMetadataRef = useRef<EnvironmentSceneMetadata | null>(null);
  const sceneBoundsRef = useRef<THREE.Box3 | null>(null);
  const collisionMeshesRef = useRef<THREE.Mesh[]>([]);
  const sceneBaseFloorYRef = useRef(0);
  const fpsSamplesRef = useRef<number[]>([]);
  const animationClipRef = useRef<AnimationClip | null>(null);
  const avatarRef = useRef<ReturnType<typeof useApp>['state']['avatar'] | null>(null);
  const emotionBlendRef = useRef<Record<string, number>>({});
  const resizeRendererRef = useRef<(() => void) | null>(null);
  const roomStateRef = useRef<RoomState>({
    roomMode: 'none',
    currentAnchorId: null,
    targetAnchorId: null,
    currentHotspotId: null,
    currentLookTarget: null,
    lastRoomActionAt: 0,
    currentTargetPosition: null,
  });
  const cameraModeRef = useRef<CameraMode>('orbit');
  const cameraHomeRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    freeLookSpawn: THREE.Vector3 | null;
    fov: number;
  }>({
    position: new THREE.Vector3(0, 1.2, 3),
    target: new THREE.Vector3(0, 1, 0),
    freeLookSpawn: null,
    fov: 30,
  });
  const freeLookStateRef = useRef({
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    yaw: 0,
    pitch: -0.05,
    moveSpeed: 2.6,
    keys: new Set<string>(),
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [renderPaused, setRenderPaused] = useState(false);
  const [viewerNotice, setViewerNotice] = useState<ViewerNotice>(null);
  const [viewerInitError, setViewerInitError] = useState<string | null>(null);
  const renderPausedRef = useRef(false);
  const documentHiddenRef = useRef(false);
  const pauseMetricsReportedRef = useRef(false);
  const previousCameraModeRef = useRef<CameraMode>('orbit');
  const previousRenderPausedRef = useRef(false);

  const { state: modelState, dispatch: modelDispatch } = useModel();
  const { state: appState, dispatch: appDispatch } = useApp();
  const {
    state: companionState,
    activePersona,
  } = useCompanion();
  const {
    currentEnvironment,
    state: environmentState,
    incrementFamiliarity,
    setRoomRuntime,
  } = useEnvironment();
  const renderSettingsRef = useRef(companionState.renderSettings);
  const activePersonaRef = useRef(activePersona);
  const currentEnvironmentRef = useRef<EnvironmentSceneProfile | null>(currentEnvironment);
  const familiarityByEnvironmentIdRef = useRef(environmentState.familiarityByEnvironmentId);

  useEffect(() => {
    renderPausedRef.current = renderPaused;
    pauseMetricsReportedRef.current = false;
    if (!renderPaused) {
      lastTimeRef.current = performance.now();
    }
  }, [renderPaused]);

  useEffect(() => {
    if (previousCameraModeRef.current !== cameraMode && cameraMode === 'freelook') {
      setViewerNotice('freelook');
    }
    previousCameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    if (!previousRenderPausedRef.current && renderPaused) {
      setViewerNotice('paused');
    } else if (previousRenderPausedRef.current && !renderPaused) {
      setViewerNotice((current) => (current === 'paused' ? null : current));
    }
    previousRenderPausedRef.current = renderPaused;
  }, [renderPaused]);

  useEffect(() => {
    avatarRef.current = appState.avatar;
  }, [appState.avatar]);

  useEffect(() => {
    activePersonaRef.current = activePersona;
  }, [activePersona]);

  useEffect(() => {
    currentEnvironmentRef.current = currentEnvironment;
  }, [currentEnvironment]);

  useEffect(() => {
    familiarityByEnvironmentIdRef.current = environmentState.familiarityByEnvironmentId;
  }, [environmentState.familiarityByEnvironmentId]);

  useEffect(() => {
    renderSettingsRef.current = companionState.renderSettings;
    resizeRendererRef.current?.();
    if (controlsRef.current) {
      controlsRef.current.rotateSpeed = companionState.renderSettings.orbitSensitivity;
    }
  }, [companionState.renderSettings]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    if (controlsRef.current) {
      controlsRef.current.enabled = cameraMode === 'orbit';
      controlsRef.current.enablePan = cameraMode === 'orbit';
      controlsRef.current.enableZoom = cameraMode === 'orbit';
    }
    if (cameraMode === 'freelook' && cameraRef.current && controlsRef.current) {
      const freeLookSpawn = cameraHomeRef.current.freeLookSpawn;
      if (freeLookSpawn) {
        cameraRef.current.position.copy(freeLookSpawn);
        controlsRef.current.target.copy(cameraHomeRef.current.target);
        cameraRef.current.updateProjectionMatrix();
        syncFreeLookOrientationFromCamera(cameraRef.current, freeLookStateRef.current);
      }
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cameraMode === 'freelook' ? 'grab' : 'default';
    }
  }, [cameraMode]);

  useEffect(() => {
    let cancelled = false;
    const provider = getAnimationProvider(appState.providerConfig.animation.primary);

    void provider.generate({
      message: appState.avatar.lastAssistantText,
      metadata: {
        emotion: appState.avatar.emotion,
        energy: appState.avatar.energy,
        intimacy: appState.avatar.intimacy,
        gesture: appState.avatar.gesture,
        gaze: appState.avatar.gaze,
        talkIntensity: appState.avatar.talkIntensity,
        reaction: appState.avatar.reaction,
        idle: appState.avatar.idle,
        sceneBeat: appState.avatar.sceneBeat,
      },
      phase: appState.avatar.phase,
      moodCarry: appState.avatar.moodCarry,
      speechPlaybackActive: appState.avatar.speechPlaybackActive,
      tuning: appState.avatarTuning,
    }).then((clip) => {
      if (!cancelled) {
        animationClipRef.current = clip;
      }
    }).catch(() => {
      if (!cancelled) {
        animationClipRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appState.avatar, appState.avatarTuning, appState.providerConfig.animation.primary]);

  const createRenderer = useCallback((canvas: HTMLCanvasElement, antialias: boolean) => {
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias,
        alpha: true,
      });
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      setViewerInitError(null);
      return renderer;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage = normalizeRendererInitError(message);
      setViewerInitError(normalizedMessage);
      return null;
    }
  }, []);

  const getPrimaryAnchor = useCallback((metadata: EnvironmentSceneMetadata | null) => {
    if (!metadata) return null;
    const preferredId = currentEnvironmentRef.current?.defaultSpawnId ?? null;
    if (preferredId) {
      return metadata.anchors.find((anchor) => anchor.id === preferredId) ?? metadata.anchors[0] ?? null;
    }
    return metadata.anchors[0] ?? null;
  }, []);

  const applyCameraPreset = useCallback((
    preset: EnvironmentSceneMetadata['cameraPreset'] | null | undefined,
    options?: { useFreeLookSpawn?: boolean },
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const useFreeLookSpawn = options?.useFreeLookSpawn ?? false;
    const position = useFreeLookSpawn && preset?.freeLookSpawn
      ? preset.freeLookSpawn
      : preset?.position ?? [0, 1.2, 3];
    const target = preset?.target ?? [0, 1, 0];
    const fov = preset?.fov ?? 30;

    camera.fov = fov;
    camera.position.set(...position);
    controls.target.set(...target);
    camera.updateProjectionMatrix();
    controls.update();
    syncFreeLookOrientationFromCamera(camera, freeLookStateRef.current);

    cameraHomeRef.current = {
      position: new THREE.Vector3(...(preset?.position ?? [0, 1.2, 3])),
      target: new THREE.Vector3(...target),
      freeLookSpawn: preset?.freeLookSpawn ? new THREE.Vector3(...preset.freeLookSpawn) : null,
      fov,
    };
  }, []);

  const frameCameraForAvatar = useCallback((anchor: SceneAnchor | null) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const vrm = currentVrmRef.current;
    if (!camera || !controls || !anchor) return;

    const sceneBounds = new THREE.Box3().setFromObject(vrm.scene);
    const sceneSize = sceneBounds.getSize(new THREE.Vector3());
    const headBone = getBoneNode(vrm, 'head');
    const target = headBone
      ? headBone.getWorldPosition(new THREE.Vector3()).setY(sceneBounds.min.y + sceneSize.y * 0.74)
      : new THREE.Vector3(anchor.position[0], sceneBounds.min.y + sceneSize.y * 0.74, anchor.position[2]);

    const yaw = anchor.rotationY + Math.PI;
    const shoulderYaw = yaw + 0.18;
    const orbitDistance = THREE.MathUtils.clamp(sceneSize.y * 1.82, 2.7, 4.3);
    const heightOffset = THREE.MathUtils.clamp(sceneSize.y * 0.26, 0.4, 0.82);
    const sideBias = THREE.MathUtils.clamp(sceneSize.x * 0.03, 0.05, 0.18);
    const nextPosition = target.clone().add(new THREE.Vector3(
      Math.sin(shoulderYaw) * orbitDistance + Math.cos(yaw) * sideBias,
      heightOffset,
      Math.cos(shoulderYaw) * orbitDistance - Math.sin(yaw) * sideBias,
    ));
    const freeLookSpawn = target.clone().add(new THREE.Vector3(
      Math.sin(yaw) * Math.max(1.2, orbitDistance * 0.74),
      Math.max(0.24, heightOffset * 0.84),
      Math.cos(yaw) * Math.max(1.2, orbitDistance * 0.74),
    ));
    const fov = THREE.MathUtils.clamp(37 - sceneSize.y * 2.1, 29, 36);

    cameraHomeRef.current = {
      position: nextPosition,
      target: target.clone(),
      freeLookSpawn,
      fov,
    };

    if (cameraModeRef.current === 'orbit') {
      camera.fov = fov;
      camera.position.copy(cameraHomeRef.current.position);
      controls.target.copy(cameraHomeRef.current.target);
      camera.updateProjectionMatrix();
      controls.update();
    } else {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, []);

  const findReachableAnchor = useCallback((
    anchors: SceneAnchor[],
    currentAnchorId: string | null,
    rootPosition: THREE.Vector3,
  ): SceneAnchor | null => {
    const candidates = anchors
      .filter((anchor) => anchor.id !== currentAnchorId)
      .sort((left, right) => {
        const leftDistance = new THREE.Vector3(...left.position).distanceTo(rootPosition);
        const rightDistance = new THREE.Vector3(...right.position).distanceTo(rootPosition);
        return leftDistance - rightDistance;
      });

    for (const candidate of candidates) {
      const candidatePosition = new THREE.Vector3(...candidate.position);
      if (!isPathBlocked(collisionMeshesRef.current, rootPosition, candidatePosition)) {
        return candidate;
      }
    }

    return null;
  }, []);

  const getAnchorById = useCallback((anchorId: string | null) => {
    if (!anchorId || !environmentMetadataRef.current) return null;
    return environmentMetadataRef.current.anchors.find((anchor) => anchor.id === anchorId) ?? null;
  }, []);

  const placeAvatarAtAnchor = useCallback((anchor: SceneAnchor | null) => {
    const vrm = currentVrmRef.current;
    if (!vrm) return;

    const targetAnchor = anchor ?? getPrimaryAnchor(environmentMetadataRef.current);
    if (!targetAnchor) return;

    placeAvatarOnSampledFloor(
      vrm,
      collisionMeshesRef.current,
      sceneBoundsRef.current,
      environmentMetadataRef.current,
      sceneBaseFloorYRef.current,
      targetAnchor.position[0],
      targetAnchor.position[2],
      targetAnchor.position[1],
    );
    vrm.scene.rotation.y = targetAnchor.rotationY;

    roomStateRef.current.currentAnchorId = targetAnchor.id;
    roomStateRef.current.targetAnchorId = null;
    roomStateRef.current.currentTargetPosition = null;
    roomStateRef.current.roomMode = 'settling';

    const environment = currentEnvironmentRef.current;
    const familiarity = environment ? (familiarityByEnvironmentIdRef.current[environment.id] ?? 0) : 0;
    setRoomRuntime({
      roomMode: 'settling',
      currentAnchorId: targetAnchor.id,
      targetAnchorId: null,
      currentHotspotId: null,
      familiarity,
      environmentName: environment?.name ?? null,
    });
    if (environmentMetadataRef.current?.cameraPreset) {
      applyCameraPreset(environmentMetadataRef.current.cameraPreset);
    } else {
      frameCameraForAvatar(targetAnchor);
    }
  }, [applyCameraPreset, frameCameraForAvatar, getPrimaryAnchor, setRoomRuntime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.tabIndex = 0;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      30,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 1, 3);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1, 0);
    controls.screenSpacePanning = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.rotateSpeed = renderSettingsRef.current.orbitSensitivity;
    controls.update();
    controlsRef.current = controls;
    syncFreeLookOrientationFromCamera(camera, freeLookStateRef.current);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 2, 2);
    scene.add(dirLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambLight);

    rendererRef.current = createRenderer(canvas, renderSettingsRef.current.antialias);
    if (!rendererRef.current) {
      sceneRef.current = null;
      cameraRef.current = null;
      controls.dispose();
      controlsRef.current = null;
      resizeRendererRef.current = null;
      return () => {
        controls.dispose();
      };
    }

    function syncRendererSize() {
      const renderer = rendererRef.current;
      const currentCamera = cameraRef.current;
      if (!renderer || !currentCamera) return;

      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, renderSettingsRef.current.pixelRatioCap);
      renderer.setPixelRatio(pixelRatio);
      currentCamera.aspect = w / h;
      currentCamera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    resizeRendererRef.current = syncRendererSize;
    syncRendererSize();

    // Debounce resize events to prevent excessive re-renders during window
    // drag-resize.  The immediate first call ensures the renderer stays
    // roughly correct, then the trailing call cleans up precisely.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        syncRendererSize();
      }, 100);
    };

    window.addEventListener('resize', debouncedResize);
    const resizeObserver = new ResizeObserver(() => debouncedResize());
    resizeObserver.observe(container);

    const handlePointerDown = (event: PointerEvent) => {
      if (cameraModeRef.current !== 'freelook') return;
      freeLookStateRef.current.dragging = true;
      freeLookStateRef.current.lastPointerX = event.clientX;
      freeLookStateRef.current.lastPointerY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (cameraModeRef.current !== 'freelook' || !freeLookStateRef.current.dragging) return;
      const deltaX = event.clientX - freeLookStateRef.current.lastPointerX;
      const deltaY = event.clientY - freeLookStateRef.current.lastPointerY;
      freeLookStateRef.current.lastPointerX = event.clientX;
      freeLookStateRef.current.lastPointerY = event.clientY;
      freeLookStateRef.current.yaw -= deltaX * 0.0032;
      freeLookStateRef.current.pitch = THREE.MathUtils.clamp(
        freeLookStateRef.current.pitch - deltaY * 0.0026,
        -1.2,
        1.2,
      );
    };

    const stopDragging = (pointerId?: number) => {
      freeLookStateRef.current.dragging = false;
      if (pointerId !== undefined) {
        canvas.releasePointerCapture?.(pointerId);
      }
      canvas.style.cursor = cameraModeRef.current === 'freelook' ? 'grab' : 'default';
    };

    const handlePointerUp = (event: PointerEvent) => {
      stopDragging(event.pointerId);
    };

    const handlePointerLeave = (event: PointerEvent) => {
      stopDragging(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      if (cameraModeRef.current !== 'freelook') return;
      event.preventDefault();
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const forward = direction.normalize();
      const distance = THREE.MathUtils.clamp(event.deltaY * 0.0025, -0.75, 0.75);
      camera.position.addScaledVector(forward, distance);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (cameraModeRef.current !== 'freelook') return;
      freeLookStateRef.current.keys.add(event.key.toLowerCase());
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      freeLookStateRef.current.keys.delete(event.key.toLowerCase());
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    documentHiddenRef.current = document.hidden;

    const handleVisibilityChange = () => {
      documentHiddenRef.current = document.hidden;
      pauseMetricsReportedRef.current = false;
      if (!document.hidden) {
        lastTimeRef.current = performance.now();
      }
    };

    const clearScheduledTick = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      if (slowTickTimeoutRef.current !== null) {
        window.clearTimeout(slowTickTimeoutRef.current);
        slowTickTimeoutRef.current = null;
      }
    };

    const scheduleNextTick = () => {
      if (renderPausedRef.current || documentHiddenRef.current) {
        if (slowTickTimeoutRef.current !== null) return;
        slowTickTimeoutRef.current = window.setTimeout(() => {
          slowTickTimeoutRef.current = null;
          animate(performance.now());
        }, renderPausedRef.current ? 420 : 180);
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    function animate(timestamp: number) {
      scheduleNextTick();
      const elapsed = timestamp - lastTimeRef.current;
      const frameInterval = 1000 / renderSettingsRef.current.fpsCap;

      if (renderPausedRef.current || documentHiddenRef.current) {
        if (!pauseMetricsReportedRef.current) {
          appDispatch({
            type: 'UPDATE_METRICS',
            payload: { currentFps: 0 },
          });
          pauseMetricsReportedRef.current = true;
        }
        rendererRef.current?.render(scene, camera);
        return;
      }
      pauseMetricsReportedRef.current = false;

      if (cameraModeRef.current === 'orbit') {
        controls.update();
      } else {
        const freeLook = freeLookStateRef.current;
        const desiredQuaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(freeLook.pitch, freeLook.yaw, 0, 'YXZ'),
        );
        camera.quaternion.slerp(desiredQuaternion, 0.22);

        const dt = Math.max(0.001, elapsed / 1000);
        const horizontalForward = new THREE.Vector3();
        camera.getWorldDirection(horizontalForward);
        horizontalForward.y = 0;
        if (horizontalForward.lengthSq() > 0.0001) {
          horizontalForward.normalize();
        } else {
          horizontalForward.set(0, 0, -1);
        }
        const right = new THREE.Vector3().crossVectors(horizontalForward, new THREE.Vector3(0, 1, 0)).normalize();
        const move = new THREE.Vector3();
        const keys = freeLook.keys;

        if (keys.has('w') || keys.has('arrowup')) move.add(horizontalForward);
        if (keys.has('s') || keys.has('arrowdown')) move.sub(horizontalForward);
        if (keys.has('d') || keys.has('arrowright')) move.add(right);
        if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
        if (keys.has('q')) move.y += 1;
        if (keys.has('e')) move.y -= 1;

        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar((keys.has('shift') ? 4.8 : freeLook.moveSpeed) * dt);
          camera.position.add(move);
        }

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        controls.target.copy(camera.position.clone().add(direction.multiplyScalar(2.5)));
      }

      if (elapsed < frameInterval) return;
      lastTimeRef.current = timestamp - (elapsed % frameInterval);
      controls.rotateSpeed = renderSettingsRef.current.orbitSensitivity;

      const currentVrm = currentVrmRef.current;
      const avatar = avatarRef.current;
      const environment = currentEnvironmentRef.current;
      const avatarSupportTier = avatarSupportTierRef.current;
      const personaMotion = getPersonaMotionProfile(activePersonaRef.current);
      const speakingActive = Boolean(avatar && (avatar.speechPlaybackActive || avatar.phase === 'speaking'));

      if (currentVrm) {
        if (speakingActive) {
          if (roomStateRef.current.roomMode !== 'speaking') {
            roomStateRef.current.roomMode = 'speaking';
            setRoomRuntime({
              roomMode: 'speaking',
              currentAnchorId: roomStateRef.current.currentAnchorId,
              targetAnchorId: null,
              currentHotspotId: roomStateRef.current.currentHotspotId,
              familiarity: environment ? (familiarityByEnvironmentIdRef.current[environment.id] ?? 0) : 0,
              environmentName: environment?.name ?? null,
            });
          }
        } else if (environment && environmentMetadataRef.current) {
          const now = Date.now();
          const roomState = roomStateRef.current;
          const anchors = environmentMetadataRef.current.anchors;
          const hotspots = environmentMetadataRef.current.hotspots;
          const rootPosition = currentVrm.scene.position;
          const familiarity = familiarityByEnvironmentIdRef.current[environment.id] ?? 0;

          if (
            roomState.currentTargetPosition &&
            roomState.targetAnchorId
          ) {
            roomState.roomMode = 'walking';
            setRoomRuntime({
              roomMode: 'walking',
              currentAnchorId: roomState.currentAnchorId,
              targetAnchorId: roomState.targetAnchorId,
              currentHotspotId: roomState.currentHotspotId,
              familiarity,
              environmentName: environment.name,
            });

            const moveSpeed = personaMotion.preferStationary ? 0.34 : 0.52;
            const nextPosition = rootPosition.clone();
            nextPosition.lerp(roomState.currentTargetPosition, Math.min(1, (elapsed / 1000) * moveSpeed));
            placeAvatarOnSampledFloor(
              currentVrm,
              collisionMeshesRef.current,
              sceneBoundsRef.current,
              environmentMetadataRef.current,
              sceneBaseFloorYRef.current,
              nextPosition.x,
              nextPosition.z,
            );
            rootPosition.copy(currentVrm.scene.position);

            const facingYaw = Math.atan2(
              roomState.currentTargetPosition.x - rootPosition.x,
              roomState.currentTargetPosition.z - rootPosition.z,
            );
            currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, facingYaw, 0.09);

            if (rootPosition.distanceTo(roomState.currentTargetPosition) < 0.12) {
              roomState.currentAnchorId = roomState.targetAnchorId;
              roomState.targetAnchorId = null;
              roomState.currentTargetPosition = null;
              roomState.roomMode = 'waiting';
              roomState.lastRoomActionAt = now;
              void incrementFamiliarity(environment.id, 0.02);
              setRoomRuntime({
                roomMode: 'waiting',
                currentAnchorId: roomState.currentAnchorId,
                targetAnchorId: null,
                currentHotspotId: roomState.currentHotspotId,
                familiarity,
                environmentName: environment.name,
              });
            }
          } else {
            const sinceLastAction = now - roomState.lastRoomActionAt;
            const roomFamiliarity = familiarity;
            const curiosityModifier = 1 - roomFamiliarity * 0.55;
            const roamingAllowed = avatarSupportTier !== 'fallback' && Boolean(environmentMetadataRef.current?.roamEnabled);

            if (roomState.roomMode === 'settling' && sinceLastAction > 1800) {
              roomState.roomMode = 'waiting';
              roomState.lastRoomActionAt = now;
              setRoomRuntime({
                roomMode: 'waiting',
                currentAnchorId: roomState.currentAnchorId,
                targetAnchorId: null,
                currentHotspotId: null,
                familiarity,
                environmentName: environment.name,
              });
            }

            if (sinceLastAction > personaMotion.roamIntervalMs * curiosityModifier) {
              const shouldRoam = Math.random() < personaMotion.roamProbability * curiosityModifier;
              const shouldLook = Math.random() < personaMotion.lookProbability * curiosityModifier;

              if (shouldRoam && roamingAllowed && anchors.length > 1) {
                const nextAnchor = findReachableAnchor(anchors, roomState.currentAnchorId, rootPosition);
                if (!nextAnchor) {
                  roomState.roomMode = 'waiting';
                  roomState.currentHotspotId = null;
                  roomState.currentLookTarget = null;
                  roomState.lastRoomActionAt = now;
                  setRoomRuntime({
                    roomMode: 'waiting',
                    currentAnchorId: roomState.currentAnchorId,
                    targetAnchorId: null,
                    currentHotspotId: null,
                    familiarity,
                    environmentName: environment.name,
                  });
                }
                if (nextAnchor) {
                  const targetPosition = new THREE.Vector3(
                    nextAnchor.position[0],
                    nextAnchor.position[1],
                    nextAnchor.position[2],
                  );
                  roomState.targetAnchorId = nextAnchor.id;
                  roomState.currentTargetPosition = targetPosition;
                  roomState.currentHotspotId = null;
                  roomState.lastRoomActionAt = now;
                }
              } else if (shouldLook && hotspots.length > 0) {
                const hotspot = hotspots[Math.floor(Math.random() * hotspots.length)] ?? null;
                roomState.currentHotspotId = hotspot?.id ?? null;
                roomState.currentLookTarget = hotspot
                  ? new THREE.Vector3(...hotspot.lookAt)
                  : null;
                roomState.roomMode = hotspot ? 'looking' : 'waiting';
                roomState.lastRoomActionAt = now;
                void incrementFamiliarity(environment.id, 0.01);
                setRoomRuntime({
                  roomMode: hotspot ? 'looking' : 'waiting',
                  currentAnchorId: roomState.currentAnchorId,
                  targetAnchorId: null,
                  currentHotspotId: hotspot?.id ?? null,
                  familiarity,
                  environmentName: environment.name,
                });
              } else {
                roomState.roomMode = 'waiting';
                roomState.currentHotspotId = null;
                roomState.currentLookTarget = null;
                roomState.lastRoomActionAt = now;
              }
            }

            const camera = cameraRef.current;
            const currentAnchor = getAnchorById(roomState.currentAnchorId);
            const baseYaw = currentAnchor?.rotationY ?? currentVrm.scene.rotation.y;
            const desiredYaw = camera
              ? Math.atan2(
                camera.position.x - rootPosition.x,
                camera.position.z - rootPosition.z,
              )
              : baseYaw;
            const maxOffset = roomState.currentLookTarget ? 0.05 : 0.14;
            const clampedYaw = clampAngleAroundBase(desiredYaw, baseYaw, maxOffset);
            currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, clampedYaw, roomState.currentLookTarget ? 0.014 : 0.02);
          }
        }

        if (avatar) {
          const frame = resolveAvatarPresentation(avatar, Date.now());
          const tierMotionScale = avatarSupportTier === 'full'
            ? 1
            : avatarSupportTier === 'partial'
              ? 0.72
              : 0.42;
          const speechBoost = personaMotion.speechEnergy
            * (roomStateRef.current.roomMode === 'speaking' ? 1.12 : 1)
            * tierMotionScale;
          applyFallbackRelaxedPose(currentVrm, avatarSupportTier === 'fallback' ? 0.58 : 0.34, avatarSupportTier);
          applyIdleBaseline(
            currentVrm,
            timestamp,
            frame.moodCarry * (renderSettingsRef.current.animationQuality === 'high' ? 1.1 : 1) * tierMotionScale,
            frame.settleBlend,
            frame.speechBlend * speechBoost * (renderSettingsRef.current.lipSyncQuality === 'high' ? 1.1 : 1),
            roomStateRef.current.currentLookTarget ? 1 : 0,
            activePersonaRef.current?.dereTypes[0] ?? '',
          );
          if (avatarSupportTier !== 'fallback') {
            applyAvatarPerformance(
              currentVrm,
              animationClipRef.current,
              timestamp,
              frame.speechBlend * tierMotionScale,
              frame.reactionBlend * tierMotionScale,
              frame.settleBlend,
              frame.moodCarry * tierMotionScale,
              speechBoost,
            );
          }
          applyArmPoseClamp(currentVrm, avatarSupportTier === 'fallback' ? 0.8 : 0.88, avatarSupportTier);
          // Emotion-driven expression auto-switch: lerp toward emotion BlendShapes.
          applyEmotionExpression(currentVrm, avatar.emotion, emotionBlendRef.current);
        } else {
          applyFallbackRelaxedPose(currentVrm, avatarSupportTier === 'fallback' ? 0.88 : 0.72, avatarSupportTier);
          applyIdleBaseline(currentVrm, timestamp, 0.4, 0.2, 0, roomStateRef.current.currentLookTarget ? 1 : 0, activePersonaRef.current?.dereTypes[0] ?? '');
          applyArmPoseClamp(currentVrm, avatarSupportTier === 'fallback' ? 0.82 : 0.9, avatarSupportTier);
        }

        const preClampX = currentVrm.scene.position.x;
        const preClampZ = currentVrm.scene.position.z;
        clampAvatarToWalkBounds(currentVrm.scene.position, environmentMetadataRef.current, sceneBoundsRef.current);
        if (
          currentVrm.scene.position.x !== preClampX
          || currentVrm.scene.position.z !== preClampZ
        ) {
          placeAvatarOnSampledFloor(
            currentVrm,
            collisionMeshesRef.current,
            sceneBoundsRef.current,
            environmentMetadataRef.current,
            sceneBaseFloorYRef.current,
            currentVrm.scene.position.x,
            currentVrm.scene.position.z,
          );
        }
        currentVrm.update(elapsed / 1000);
      }

      rendererRef.current?.render(scene, camera);

      fpsSamplesRef.current.push(timestamp);
      if (fpsSamplesRef.current.length > FPS_SAMPLE_SIZE) {
        fpsSamplesRef.current.shift();
      }

      if (fpsSamplesRef.current.length >= 2) {
        const oldest = fpsSamplesRef.current[0];
        const newest = fpsSamplesRef.current[fpsSamplesRef.current.length - 1];
        const windowMs = newest - oldest;
        const avgFps = windowMs > 0
          ? Math.round(((fpsSamplesRef.current.length - 1) / windowMs) * 1000)
          : 0;
        const prev = fpsSamplesRef.current[fpsSamplesRef.current.length - 2];
        const curFps = (newest - prev) > 0 ? Math.round(1000 / (newest - prev)) : 0;
        appDispatch({
          type: 'UPDATE_METRICS',
          payload: { currentFps: curFps, averageFps: avgFps },
        });
      }
    }

    scheduleNextTick();

    return () => {
      clearScheduledTick();
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controls.dispose();
      rendererRef.current?.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      resizeRendererRef.current = null;
    };
  }, [
    appDispatch,
    createRenderer,
    getAnchorById,
    incrementFamiliarity,
    placeAvatarAtAnchor,
    setRoomRuntime,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const previousRenderer = rendererRef.current;
    const nextRenderer = createRenderer(canvas, companionState.renderSettings.antialias);
    if (!nextRenderer) return;
    rendererRef.current = nextRenderer;
    resizeRendererRef.current?.();
    previousRenderer.dispose();
  }, [companionState.renderSettings.antialias, createRenderer]);

  const loadVRM = useCallback(async (url: string) => {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await new Promise<{ scene: THREE.Group; userData: { vrm?: VRM } }>((resolve, reject) => {
        loader.load(
          url,
          (result) => resolve(result as unknown as { scene: THREE.Group; userData: { vrm?: VRM } }),
          (progressEvent) => {
            if (progressEvent.lengthComputable) {
              modelDispatch({
                type: 'SET_PROGRESS',
                payload: Math.round((progressEvent.loaded / progressEvent.total) * 100),
              });
            }
          },
          (err) => reject(err instanceof Error ? err : new Error(String(err))),
        );
      });

      const vrm = gltf.userData.vrm;
      if (!vrm) {
        throw new Error('Loaded file does not contain a valid VRM model.');
      }

      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.combineMorphs(vrm);
      VRMUtils.rotateVRM0(vrm);

      vrm.scene.traverse((child) => {
        child.frustumCulled = false;
      });

      if (currentVrmRef.current) {
        resetIdleAnimState();
        scene.remove(currentVrmRef.current.scene);
        VRMUtils.deepDispose(currentVrmRef.current.scene);
      }

      scene.add(vrm.scene);
      currentVrmRef.current = vrm;
      const avatarBounds = new THREE.Box3().setFromObject(vrm.scene);
      const avatarHeight = Math.max(0.001, avatarBounds.max.y - avatarBounds.min.y);
      const targetHeight = 1.5;
      const scaleFactor = THREE.MathUtils.clamp(targetHeight / avatarHeight, 0.55, 2.2);
      vrm.scene.scale.multiplyScalar(scaleFactor);
      vrm.scene.updateMatrixWorld(true);
      avatarSupportTierRef.current = resolveAvatarSupportTier(vrm);
      applyFallbackRelaxedPose(vrm, 1, avatarSupportTierRef.current);
      applyIdleBaseline(vrm, performance.now(), 0.48, 0.36, 0, 0, '');
      if (environmentMetadataRef.current) {
        placeAvatarAtAnchor(getPrimaryAnchor(environmentMetadataRef.current));
      } else {
        vrm.scene.position.set(0, 0, 0);
        snapAvatarToFloor(vrm, 0);
      }
      vrm.update(0);
      modelDispatch({ type: 'SET_LOADING', payload: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load VRM model';
      const normalizedMessage = normalizeModelLoadError(message);

      if (url.startsWith('/local-models/') && normalizedMessage !== message) {
        modelDispatch({ type: 'CLEAR_MODEL_URL' });
        modelDispatch({
          type: 'SET_ERROR',
          payload: normalizedMessage,
        });
        return;
      }
      modelDispatch({ type: 'SET_ERROR', payload: normalizedMessage });
    }
  }, [getPrimaryAnchor, modelDispatch, placeAvatarAtAnchor]);

  const loadEnvironment = useCallback(async (environment: EnvironmentSceneProfile | null) => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    if (environmentRootRef.current) {
      scene.remove(environmentRootRef.current);
      disposeSceneObject(environmentRootRef.current);
      environmentRootRef.current = null;
      environmentMetadataRef.current = null;
      collisionMeshesRef.current = [];
      sceneBoundsRef.current = null;
      sceneBaseFloorYRef.current = 0;
      roomStateRef.current = {
        roomMode: 'none',
        currentAnchorId: null,
        targetAnchorId: null,
        currentHotspotId: null,
        currentLookTarget: null,
        lastRoomActionAt: 0,
        currentTargetPosition: null,
      };
      setRoomRuntime({
        roomMode: 'none',
        currentAnchorId: null,
        targetAnchorId: null,
        currentHotspotId: null,
        familiarity: 0,
        environmentName: null,
      });
    }

    if (!environment) {
      return;
    }

    const loader = new GLTFLoader();
    const gltf = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        environment.url,
        (result) => resolve(result.scene),
        undefined,
        (error) => reject(error instanceof Error ? error : new Error(String(error))),
      );
    });

    gltf.traverse((child) => {
      child.frustumCulled = false;
      child.renderOrder = -1;
    });

    scene.add(gltf);
    environmentRootRef.current = gltf;
    sceneBoundsRef.current = new THREE.Box3().setFromObject(gltf);
    collisionMeshesRef.current = getCollisionMeshes(gltf);
    sceneBaseFloorYRef.current = computeBaseFloorHeight(collisionMeshesRef.current, sceneBoundsRef.current);

    const metadataFromFile = environment.metadataPath
      ? await fetchEnvironmentMetadata(environment.metadataPath)
      : null;
    const metadata = normalizeEnvironmentMetadata(
      metadataFromFile ?? inferEnvironmentMetadata(gltf, environment, collisionMeshesRef.current, sceneBaseFloorYRef.current),
      gltf,
      environment,
      collisionMeshesRef.current,
      sceneBaseFloorYRef.current,
    );
    sceneBaseFloorYRef.current = metadata.baseFloorYOverride ?? sceneBaseFloorYRef.current;
    environmentMetadataRef.current = metadata;

    applyCameraPreset(metadata.cameraPreset);

    roomStateRef.current = {
      roomMode: 'settling',
      currentAnchorId: getPrimaryAnchor(metadata)?.id ?? null,
      targetAnchorId: null,
      currentHotspotId: null,
      currentLookTarget: null,
      lastRoomActionAt: Date.now(),
      currentTargetPosition: null,
    };
    setRoomRuntime({
      roomMode: 'settling',
      currentAnchorId: getPrimaryAnchor(metadata)?.id ?? null,
      targetAnchorId: null,
      currentHotspotId: null,
      familiarity: familiarityByEnvironmentIdRef.current[environment.id] ?? 0,
      environmentName: environment.name,
    });
    void incrementFamiliarity(environment.id, 0.03);

    if (currentVrmRef.current) {
      placeAvatarAtAnchor(getPrimaryAnchor(metadata));
    }
  }, [applyCameraPreset, getPrimaryAnchor, incrementFamiliarity, placeAvatarAtAnchor, setRoomRuntime]);

  const resetCameraView = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.fov = cameraHomeRef.current.fov;
    camera.position.copy(cameraHomeRef.current.position);
    controls.target.copy(cameraHomeRef.current.target);
    camera.updateProjectionMatrix();
    controls.update();
    syncFreeLookOrientationFromCamera(camera, freeLookStateRef.current);
  }, []);

  useEffect(() => {
    if (modelState.modelUrl) {
      void loadVRM(modelState.modelUrl);
    }
  }, [modelState.modelUrl, loadVRM]);

  useEffect(() => {
    void loadEnvironment(currentEnvironment);
  }, [currentEnvironment, loadEnvironment]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const debugWindow = window as Window & {
      __animegirlyDebug?: Record<string, unknown>;
    };
    const currentVrm = currentVrmRef.current;
    const avatarBounds = currentVrm ? new THREE.Box3().setFromObject(currentVrm.scene) : null;
    const leftFoot = currentVrm ? getBoneNode(currentVrm, 'leftFoot') : null;
    const rightFoot = currentVrm ? getBoneNode(currentVrm, 'rightFoot') : null;

    debugWindow.__animegirlyDebug = {
      ...(debugWindow.__animegirlyDebug ?? {}),
      environment: currentEnvironmentRef.current,
      environmentMetadata: environmentMetadataRef.current,
      roomState: roomStateRef.current,
      avatarSupportTier: avatarSupportTierRef.current,
      renderPaused: renderPausedRef.current,
      cameraHome: {
        position: cameraHomeRef.current.position.toArray(),
        target: cameraHomeRef.current.target.toArray(),
        freeLookSpawn: cameraHomeRef.current.freeLookSpawn?.toArray() ?? null,
        fov: cameraHomeRef.current.fov,
      },
      sceneBounds: sceneBoundsRef.current
        ? {
            min: sceneBoundsRef.current.min.toArray(),
            max: sceneBoundsRef.current.max.toArray(),
          }
        : null,
      sceneBaseFloorY: sceneBaseFloorYRef.current,
      avatarPosition: currentVrmRef.current?.scene.position.toArray() ?? null,
      avatarBounds: avatarBounds
        ? {
            min: avatarBounds.min.toArray(),
            max: avatarBounds.max.toArray(),
          }
        : null,
      avatarFeet: {
        left: leftFoot?.getWorldPosition(new THREE.Vector3()).toArray() ?? null,
        right: rightFoot?.getWorldPosition(new THREE.Vector3()).toArray() ?? null,
      },
      avatarArmRotations: currentVrm
        ? {
            leftUpperArm: getBoneNode(currentVrm, 'leftUpperArm')?.rotation.toArray() ?? null,
            rightUpperArm: getBoneNode(currentVrm, 'rightUpperArm')?.rotation.toArray() ?? null,
            leftLowerArm: getBoneNode(currentVrm, 'leftLowerArm')?.rotation.toArray() ?? null,
            rightLowerArm: getBoneNode(currentVrm, 'rightLowerArm')?.rotation.toArray() ?? null,
          }
        : null,
    };
  });

  return (
    <div
      ref={containerRef}
      data-render-paused={renderPaused ? 'true' : 'false'}
      className={`viewer-stage w-full h-full relative min-w-0 min-h-0 ${renderPaused ? 'viewer-stage--paused' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="viewer-stage__canvas block"
        style={{ background: 'linear-gradient(180deg, #ede5ff 0%, #faf5ff 100%)' }}
      />

      <ViewerChrome
        cameraMode={cameraMode}
        renderPaused={renderPaused}
        viewerNotice={viewerNotice}
        onSetCameraMode={setCameraMode}
        onResetView={resetCameraView}
        onToggleRenderPaused={() => setRenderPaused((previous) => !previous)}
        onDismissNotice={() => setViewerNotice(null)}
      />

      {cameraMode === 'freelook' && viewerNotice !== 'freelook' && (
        <div className="sr-only">
          Free look is active.
        </div>
      )}

      {modelState.isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 rounded-anime">
          <div className="text-anime-600 font-semibold text-sm">
            Loading model… {modelState.loadingProgress}%
          </div>
          <div className="w-48 h-2 bg-anime-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-anime-400 rounded-full transition-all duration-200"
              style={{ width: `${modelState.loadingProgress}%` }}
            />
          </div>
        </div>
      )}

      {modelState.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-anime">
          <div className="text-rose-pastel-400 font-semibold text-sm text-center px-4">
            {modelState.error}
          </div>
        </div>
      )}

      {viewerInitError && (
        <div className="absolute inset-0 flex items-center justify-center rounded-anime bg-white/72">
          <div className="max-w-sm rounded-[20px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] px-5 py-4 text-center shadow-[var(--shell-shadow-soft)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-anime-600">Viewer fallback</div>
            <div className="mt-1 text-sm font-semibold text-text-primary">3D viewer unavailable</div>
            <p className="mt-1.5 text-xs leading-5 text-text-muted">{viewerInitError}</p>
          </div>
        </div>
      )}

      {!viewerInitError && !modelState.modelUrl && !modelState.isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-text-muted text-sm text-center px-6">
            No model loaded.<br />
            Upload a <span className="font-semibold text-anime-500">.glb</span> or{' '}
            <span className="font-semibold text-anime-500">.vrm</span> file in Settings.
          </p>
        </div>
      )}
    </div>
  );
}
