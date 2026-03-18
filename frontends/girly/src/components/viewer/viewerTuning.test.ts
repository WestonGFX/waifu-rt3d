import { describe, expect, it } from 'vitest';
import {
  getEnvironmentStagingProfile,
  getFallbackPoseProfile,
  getGroundingBias,
  resolveConservativeCameraDistance,
  resolveGroundFloorHeight,
} from './viewerTuning.ts';

describe('viewer tuning helpers', () => {
  it('keeps fallback arms narrower than the old mannequin spread', () => {
    const profile = getFallbackPoseProfile('fallback');

    expect(Math.abs(profile.armClamp.leftUpperArm[2])).toBeLessThan(0.9);
    expect(Math.abs(profile.armClamp.rightUpperArm[2])).toBeLessThan(0.9);
  });

  it('also narrows supported rigs so full avatars do not drift back into an A-pose', () => {
    const profile = getFallbackPoseProfile('full');

    expect(Math.abs(profile.armClamp.leftShoulder[2])).toBeLessThanOrEqual(0.05);
    expect(Math.abs(profile.armClamp.rightShoulder[2])).toBeLessThanOrEqual(0.05);
    expect(Math.abs(profile.armClamp.leftUpperArm[2])).toBeLessThan(0.45);
    expect(Math.abs(profile.armClamp.rightUpperArm[2])).toBeLessThan(0.45);
  });

  it('uses a softer neutral fallback stance instead of a mannequin spread', () => {
    const profile = getFallbackPoseProfile('fallback');

    expect(Math.abs(profile.relaxedPose.leftShoulder[2])).toBeLessThanOrEqual(0.05);
    expect(Math.abs(profile.relaxedPose.rightShoulder[2])).toBeLessThanOrEqual(0.05);
    expect(Math.abs(profile.relaxedPose.leftUpperArm[2])).toBeLessThan(0.6);
    expect(Math.abs(profile.relaxedPose.rightUpperArm[2])).toBeLessThan(0.6);
    expect(profile.relaxedPose.rightUpperLeg[0]).toBeGreaterThan(0.01);
  });

  it('makes bedroom and interior staging more conservative than the generic shell', () => {
    const bedroom = getEnvironmentStagingProfile('bedroom');
    const interior = getEnvironmentStagingProfile('interior');
    const scifi = getEnvironmentStagingProfile('sci-fi');

    expect(bedroom.walkInsetZ).toBeGreaterThan(interior.walkInsetZ - 0.001);
    expect(bedroom.cameraDistanceMax).toBeLessThan(interior.cameraDistanceMax);
    expect(interior.cameraDistanceMax).toBeLessThan(scifi.cameraDistanceMax);
    expect(interior.sideBiasMax).toBeLessThan(scifi.sideBiasMax);
  });

  it('pulls the fallback camera in when the room is tighter than the ideal framing', () => {
    expect(resolveConservativeCameraDistance(2.3, 2.9)).toBe(2.3);
    expect(resolveConservativeCameraDistance(2.3, 1.55)).toBeCloseTo(1.23, 5);
  });

  it('uses authored floor heights when they are plausibly close to the sampled floor', () => {
    expect(resolveGroundFloorHeight(0.72, 0.75)).toBe(0.75);
  });

  it('blends back toward the sampled floor when authored anchor height is obviously off', () => {
    expect(resolveGroundFloorHeight(0.72, 1.12)).toBeCloseTo(0.776, 5);
  });

  it('uses a smaller, clamped grounding bias so avatars do not visibly sink', () => {
    expect(getGroundingBias(1.7)).toBeCloseTo(0.002465, 5);
    expect(getGroundingBias(8)).toBe(0.0042);
  });
});
