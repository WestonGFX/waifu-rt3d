/**
 * Regression test: Mixamo→VRM bone retargeting in viewer.html (`ClipLayer.retargetClip`).
 *
 * Session 2026-05-31: `retargetClip` looked up clip bone names directly in
 * `MIXAMO_BONE_MAP`, whose keys keep the colon (`'mixamorig:Hips'`). But three.js
 * GLTFLoader sanitizes node names in animation-track bindings and STRIPS the colon,
 * so a GLB clip's tracks arrive as `mixamorigHips.quaternion` (no colon). The literal
 * lookup therefore matched NOTHING — every clip retargeted zero bones and played as a
 * silent no-op (avatar stuck in rest pose). Verified with a headless render
 * (`tools/verify/render_clip.mjs`): pre-fix the Xbot walk clip kept all 201 tracks and
 * never moved the rig; post-fix it remaps 25 rotation/hips tracks and drops 47
 * translation/scale tracks (201→154) and the avatar renders grounded and undistorted.
 *
 * Two structural guarantees are locked here:
 *   1. The lookup is normalization-keyed (colon-/case-insensitive), not a literal map hit.
 *   2. retargetClip drops scale + non-hips translation tracks (VRM humanoid motion is
 *      rotation-only + hips translation; keeping source translation stretches the rig).
 *
 * Structural test (reads viewer.html as text) — fragile to renames but cheap and exact
 * about the failure mode. See docs/research/2026-05-31-retarget-pipeline.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWER_HTML = resolve(__dirname, '../../../shared/viewer/viewer.html');

describe('viewer.html · ClipLayer.retargetClip', () => {
  const source = readFileSync(VIEWER_HTML, 'utf8');

  const region = (() => {
    const start = source.indexOf('retargetClip(clip)');
    expect(start, 'retargetClip(clip) method not found').toBeGreaterThan(-1);
    // The method ends before stripSpringBoneTracks (the next method).
    const end = source.indexOf('stripSpringBoneTracks(clip)', start);
    return source.slice(start, end > -1 ? end : start + 4000);
  })();

  it('uses a normalization-keyed bone lookup (colon-/case-insensitive), not a literal MIXAMO_BONE_MAP hit', () => {
    // The literal `MIXAMO_BONE_MAP[boneName]` lookup is the bug — it never matches the
    // colon-stripped track names. Require the normalized map + a normalizer instead.
    expect(region, 'must build a normalized bone map').toMatch(/_normBoneMap/);
    expect(region, 'must normalize by stripping non-alphanumerics').toMatch(
      /replace\(\s*\/\[\^a-z0-9\]\/gi\s*,\s*['"]['"]\s*\)/,
    );
    expect(
      /MIXAMO_BONE_MAP\[\s*boneName\s*\]/.test(region),
      'literal MIXAMO_BONE_MAP[boneName] lookup reintroduces the colon-mismatch no-op bug',
    ).toBe(false);
  });

  it('retargets rotation-only — drops every non-quaternion (position + scale) track', () => {
    // Mixamo clips are Z-up + centimeters; their hips track carries the standing height
    // on the Z axis (~104), which flings the VRM ~100m off-camera if applied. Rotation-only
    // retarget sidesteps all source units/up-axis: keep .quaternion, drop the rest.
    expect(region, 'must keep only .quaternion tracks').toMatch(
      /property\s*!==\s*['"]\.quaternion['"]/,
    );
    // The old hips-translation special-case must be gone (it reintroduced the off-camera bug).
    expect(
      /&&\s*!isHips/.test(region),
      'hips .position is no longer special-cased — retarget is rotation-only',
    ).toBe(false);
  });
});
