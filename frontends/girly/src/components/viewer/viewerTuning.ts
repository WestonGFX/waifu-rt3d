import { type EnvironmentSceneProfile } from '../../types/companion.ts';

export type ViewerSupportTier = 'full' | 'partial' | 'fallback';

export interface ViewerPoseProfile {
  relaxedPose: Record<string, [number, number, number]>;
  armClamp: Record<string, [number, number, number]>;
}

export interface ViewerStagingProfile {
  anchorAxisBias: number;
  anchorSideBias: number;
  cameraDistanceScale: number;
  cameraDistanceMin: number;
  cameraDistanceMax: number;
  sideBiasScale: number;
  sideBiasMin: number;
  sideBiasMax: number;
  walkInsetX: number;
  walkInsetZ: number;
  targetHeightScale: number;
  targetHeightMin: number;
  targetHeightMax: number;
  defaultPose: 'stand';
  spawnOffsetY: number;
  roamEnabled: boolean;
  roamPreset: 'calm' | 'balanced' | 'curious';
}

export function getFallbackPoseProfile(supportTier: ViewerSupportTier): ViewerPoseProfile {
  const poseScalars = supportTier === 'full'
    ? {
        shoulderRoll: 0.028,
        upperArmSpread: 0.44,
        lowerArmBend: -0.51,
      }
    : supportTier === 'partial'
      ? {
          shoulderRoll: 0.036,
          upperArmSpread: 0.49,
          lowerArmBend: -0.49,
        }
      : {
          shoulderRoll: 0.042,
          upperArmSpread: 0.55,
          lowerArmBend: -0.47,
        };
  const { shoulderRoll, upperArmSpread, lowerArmBend } = poseScalars;

  return {
    relaxedPose: {
      hips: [-0.03, 0.02, -0.015],
      spine: [0.04, -0.012, 0.012],
      chest: [0.082, -0.008, 0.02],
      neck: [0.024, 0.012, 0],
      head: [-0.034, 0.018, -0.006],
      leftShoulder: [0.01, 0.015, -shoulderRoll],
      rightShoulder: [0.01, -0.015, shoulderRoll],
      leftUpperArm: [0.118, 0.024, -upperArmSpread],
      rightUpperArm: [0.112, -0.024, upperArmSpread],
      leftLowerArm: [lowerArmBend, 0.045, -0.055],
      rightLowerArm: [lowerArmBend - 0.018, -0.045, 0.055],
      leftUpperLeg: [0.05, 0.024, -0.03],
      rightUpperLeg: [0.03, -0.02, 0.026],
      leftLowerLeg: [-0.16, 0, 0],
      rightLowerLeg: [-0.14, 0, 0],
      leftFoot: [0.028, 0.008, -0.012],
      rightFoot: [0.03, -0.008, 0.012],
    },
    armClamp: {
      leftShoulder: [0.01, 0.015, -shoulderRoll],
      rightShoulder: [0.01, -0.015, shoulderRoll],
      leftUpperArm: [0.14, 0.018, -upperArmSpread],
      rightUpperArm: [0.14, -0.018, upperArmSpread],
      leftLowerArm: [lowerArmBend, 0.05, -0.06],
      rightLowerArm: [lowerArmBend, -0.05, 0.06],
    },
  };
}

export function getEnvironmentStagingProfile(
  category: EnvironmentSceneProfile['category'],
): ViewerStagingProfile {
  switch (category) {
    case 'bedroom':
      return {
        anchorAxisBias: 0.16,
        anchorSideBias: -0.02,
        cameraDistanceScale: 0.25,
        cameraDistanceMin: 1.36,
        cameraDistanceMax: 1.96,
        sideBiasScale: 0.02,
        sideBiasMin: 0.04,
        sideBiasMax: 0.11,
        walkInsetX: 0.23,
        walkInsetZ: 0.27,
        targetHeightScale: 0.17,
        targetHeightMin: 1,
        targetHeightMax: 1.03,
        defaultPose: 'stand',
        spawnOffsetY: -0.003,
        roamEnabled: true,
        roamPreset: 'calm',
      };
    case 'office':
      return {
        anchorAxisBias: 0.16,
        anchorSideBias: 0.01,
        cameraDistanceScale: 0.3,
        cameraDistanceMin: 1.42,
        cameraDistanceMax: 2.3,
        sideBiasScale: 0.025,
        sideBiasMin: 0.05,
        sideBiasMax: 0.18,
        walkInsetX: 0.19,
        walkInsetZ: 0.22,
        targetHeightScale: 0.18,
        targetHeightMin: 1.02,
        targetHeightMax: 1.12,
        defaultPose: 'stand',
        spawnOffsetY: -0.003,
        roamEnabled: true,
        roamPreset: 'balanced',
      };
    case 'classroom':
      return {
        anchorAxisBias: 0.17,
        anchorSideBias: 0.01,
        cameraDistanceScale: 0.31,
        cameraDistanceMin: 1.46,
        cameraDistanceMax: 2.42,
        sideBiasScale: 0.03,
        sideBiasMin: 0.06,
        sideBiasMax: 0.18,
        walkInsetX: 0.18,
        walkInsetZ: 0.22,
        targetHeightScale: 0.18,
        targetHeightMin: 1,
        targetHeightMax: 1.1,
        defaultPose: 'stand',
        spawnOffsetY: -0.003,
        roamEnabled: true,
        roamPreset: 'curious',
      };
    case 'sci-fi':
      return {
        anchorAxisBias: 0.12,
        anchorSideBias: 0.04,
        cameraDistanceScale: 0.34,
        cameraDistanceMin: 1.55,
        cameraDistanceMax: 2.7,
        sideBiasScale: 0.06,
        sideBiasMin: 0.08,
        sideBiasMax: 0.22,
        walkInsetX: 0.16,
        walkInsetZ: 0.18,
        targetHeightScale: 0.18,
        targetHeightMin: 1,
        targetHeightMax: 1.12,
        defaultPose: 'stand',
        spawnOffsetY: -0.004,
        roamEnabled: true,
        roamPreset: 'curious',
      };
    case 'living-room':
    case 'interior':
    case 'unknown':
    default:
      return {
        anchorAxisBias: 0.1,
        anchorSideBias: 0.015,
        cameraDistanceScale: 0.27,
        cameraDistanceMin: 1.4,
        cameraDistanceMax: 2.16,
        sideBiasScale: 0.02,
        sideBiasMin: 0.05,
        sideBiasMax: 0.13,
        walkInsetX: 0.23,
        walkInsetZ: 0.26,
        targetHeightScale: 0.18,
        targetHeightMin: 1.02,
        targetHeightMax: 1.08,
        defaultPose: 'stand',
        spawnOffsetY: -0.003,
        roamEnabled: true,
        roamPreset: 'balanced',
      };
  }
}

export function resolveConservativeCameraDistance(preferredDistance: number, availableDistance: number): number {
  if (!Number.isFinite(availableDistance) || availableDistance <= 0) {
    return preferredDistance;
  }

  const safeDistance = Math.max(1.12, availableDistance - 0.32);
  return Math.min(preferredDistance, safeDistance);
}

export function getGroundingBias(avatarHeight: number): number {
  return Math.max(0.0009, Math.min(0.0042, avatarHeight * 0.00145));
}

export function resolveGroundFloorHeight(
  sampledFloorHeight: number,
  authoredFloorHeight?: number | null,
): number {
  if (!Number.isFinite(authoredFloorHeight ?? Number.NaN)) {
    return sampledFloorHeight;
  }

  const nextAuthoredFloor = authoredFloorHeight as number;
  const delta = Math.abs(nextAuthoredFloor - sampledFloorHeight);

  if (delta <= 0.12) {
    return nextAuthoredFloor;
  }

  if (delta >= 0.4) {
    return sampledFloorHeight + (nextAuthoredFloor - sampledFloorHeight) * 0.14;
  }

  return sampledFloorHeight + (nextAuthoredFloor - sampledFloorHeight) * 0.45;
}
