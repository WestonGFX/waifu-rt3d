/**
 * three-vrm normalized↔raw ground-truth harness (Bug 2, Finding 9 step 1).
 *
 * Loads Raine.vrm in the REAL viewer (headless Chromium) and measures — never
 * guesses — how three-vrm maps a NORMALIZED bone-local rotation to the rendered
 * RAW bone world orientation. This pins the canonical frame needed to bake
 * Mixamo clips directly into normalized space in tools/blender/retarget_to_vrm.py.
 *
 * Why: baked J_Bip_* clips render distorted because their values are raw-space
 * local rotations applied where three-vrm expects normalized-space rotations
 * (docs/research/2026-05-31-retarget-pipeline.md Findings 7-9). The conversion
 * constant must be MEASURED via this harness — a guessed conversion was the
 * formula-A/B spiral.
 *
 * Probes (all synchronous inside one evaluate — the RAF loop cannot interleave):
 *   A. Pose inventory at load (the viewer's natural pose, NOT rest — documents
 *      why naive "current pose = rest" probing mis-measures by ~80°).
 *   A'. T-pose reference: zero EVERY normalized bone local → measure raw bone
 *      world orientations. three-vrm's normalized convention predicts identity.
 *   B. Single-bone: from the T-pose reference, set a known normalized-local q
 *      on leftUpperArm (90° about world X / Y / Z, plus the Blender-measured
 *      82.7° wave axis), run humanoid.update(), read the raw bone's world
 *      delta from the T-pose reference. Prediction: delta == q exactly.
 *   C. Chain: set parent+child (leftUpperArm + leftLowerArm) simultaneously,
 *      verify the child's world delta composes as q_parent * q_child.
 *
 * Prereq: backend on :8080. Usage:
 *   node tools/verify/ground_truth.mjs [--vrm /files/avatars/Raine.vrm] [--out <json path>]
 *
 * Exit 0 = all probes ran; the JSON report is written and a human-readable
 * summary (incl. predicted-vs-measured error angles) printed to stdout.
 */
import { chromium } from '/Users/chris/Code/waifu-rt3d/frontends/sakura/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg('--base', 'http://localhost:8080');
const VRM = arg('--vrm', '/files/avatars/Raine.vrm');
const OUT = arg('--out', 'docs/research/data/2026-06-11-three-vrm-ground-truth.json');

/** Wait for a specific viewer→parent message type, or reject on timeout. */
function waitForMsg(page, wantType, timeoutMs = 25000) {
  return page.evaluate(
    ({ wantType, timeoutMs }) =>
      new Promise((res, rej) => {
        const hit = (window.__viewerMsgs || []).find((m) => m.type === wantType);
        if (hit) return res(hit);
        const onMsg = (e) => {
          if (e.data && e.data.type === wantType) {
            window.removeEventListener('message', onMsg);
            res(e.data);
          }
        };
        window.addEventListener('message', onMsg);
        setTimeout(() => {
          window.removeEventListener('message', onMsg);
          rej(new Error(`timeout waiting for ${wantType}`));
        }, timeoutMs);
      }),
    { wantType, timeoutMs },
  );
}

const post = (page, msg) => page.evaluate((m) => window.postMessage(m, '*'), msg);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swrast'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  let failed = null;
  try {
    await page.goto(`${BASE}/shared/viewer/viewer.html`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => {
      window.__viewerMsgs = [];
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type) window.__viewerMsgs.push(e.data);
      });
    });
    await post(page, { type: 'setEntranceConfig', payload: { enabled: false } });
    await post(page, { type: 'loadCharacter', payload: { modelUrl: VRM } });
    await waitForMsg(page, 'modelLoaded');
    // Let one render tick settle the idle pose before probing.
    await page.waitForTimeout(500);

    const report = await page.evaluate(() => {
      const vrm = window._vrm;
      if (!vrm) throw new Error('window._vrm not set — viewer did not expose the loaded VRM');
      const h = vrm.humanoid;
      // Quaternion/Vector3 classes without a THREE export: borrow constructors
      // from live objects (same classes the viewer's bundled three.js uses).
      const Q = vrm.scene.quaternion.constructor;
      const V3 = vrm.scene.position.constructor;

      const PROBE_BONES = ['hips', 'spine', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'leftUpperLeg'];
      const qArr = (q) => [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(6));
      const getRaw = (name) =>
        h.getRawBoneNode ? h.getRawBoneNode(name) : h.humanBones?.[name]?.node ?? null;
      const worldQ = (node) => {
        const q = new Q();
        node.getWorldQuaternion(q);
        return q;
      };
      const angleBetween = (a, b) => {
        // Angular distance between two quaternions, in degrees.
        const d = Math.min(1, Math.abs(a.dot(b)));
        return +(2 * Math.acos(d) * (180 / Math.PI)).toFixed(3);
      };

      // ── Probe A: pose inventory at load (natural pose, NOT rest) ──────────
      vrm.scene.updateWorldMatrix(true, true);
      const naturalPose = {};
      for (const b of PROBE_BONES) {
        const n = h.getNormalizedBoneNode(b);
        const r = getRaw(b);
        if (!n || !r) continue;
        naturalPose[b] = {
          normalizedNodeName: n.name,
          rawNodeName: r.name,
          normLocal: qArr(n.quaternion),
          normWorld: qArr(worldQ(n)),
          rawLocal: qArr(r.quaternion),
          rawWorld: qArr(worldQ(r)),
        };
      }

      // ── Probe A': zero ALL normalized locals → true T-pose reference ──────
      // three-vrm's normalized convention: identity normalized locals = T-pose
      // with identity bone world rotations. Save the natural pose so the avatar
      // is restored after probing.
      const ALL_BONES = Object.keys(h.humanBones || {});
      const savedPose = {};
      for (const b of ALL_BONES) {
        const n = h.getNormalizedBoneNode(b);
        if (!n) continue;
        savedPose[b] = n.quaternion.clone();
        n.quaternion.set(0, 0, 0, 1);
      }
      h.update(); // normalized → raw copy (what vrm.update() does per frame)
      vrm.scene.updateWorldMatrix(true, true);

      const tPoseRawWorld = {};
      const tPose = {};
      for (const b of PROBE_BONES) {
        const r = getRaw(b);
        if (!r) continue;
        const rw = worldQ(r);
        tPoseRawWorld[b] = rw;
        // identityError: angular distance from identity — the normalized-
        // convention prediction is 0° for every bone.
        tPose[b] = { rawWorld: qArr(rw), identityError_deg: angleBetween(rw, new Q()) };
      }

      // Helpers: probe q's are applied ON TOP of the all-identity T-pose, and
      // deltas are measured against the T-pose raw world reference. All
      // synchronous — the render loop cannot interleave.
      const applyOnTPose = (boneQs) => {
        for (const [b, q] of Object.entries(boneQs)) h.getNormalizedBoneNode(b).quaternion.copy(q);
        h.update();
        vrm.scene.updateWorldMatrix(true, true);
      };
      const clearProbe = (boneQs) => {
        for (const b of Object.keys(boneQs)) h.getNormalizedBoneNode(b).quaternion.set(0, 0, 0, 1);
      };
      const rawWorldDelta = (b) => {
        // delta = rawWorld_after * inv(rawWorld_Tpose): the bone's world-space
        // rotation away from its T-pose orientation.
        const after = worldQ(getRaw(b));
        return after.multiply(tPoseRawWorld[b].clone().invert());
      };

      // ── Probe B: single-bone known rotations on leftUpperArm ──────────────
      const mkQ = (axis, deg) => {
        const a = new V3(...axis).normalize();
        return new Q().setFromAxisAngle(a, (deg * Math.PI) / 180);
      };
      const singles = [
        { label: 'X+90', axis: [1, 0, 0], deg: 90 },
        { label: 'Y+90', axis: [0, 1, 0], deg: 90 },
        { label: 'Z+90', axis: [0, 0, 1], deg: 90 },
        // The Blender-measured wave peak: 82.7° about Blender-world (+0.97,+0.23,+0.07).
        // glTF/three Y-up equivalent under the standard Z-up→Y-up swap (x, z, -y):
        { label: 'wave82.7-yup', axis: [0.97, 0.07, -0.23], deg: 82.7 },
      ];
      const probeB = [];
      for (const s of singles) {
        const q = mkQ(s.axis, s.deg);
        applyOnTPose({ leftUpperArm: q });
        const delta = rawWorldDelta('leftUpperArm');
        // Prediction under the normalized convention: with parents at identity,
        // the bone's world delta from T-pose == the normalized local q exactly.
        probeB.push({
          label: s.label,
          set_normalizedLocal: qArr(q),
          measured_rawWorldDelta: qArr(delta),
          predictionError_deg: angleBetween(q, delta),
        });
        clearProbe({ leftUpperArm: q });
      }

      // ── Probe C: chain composition (leftUpperArm + leftLowerArm) ──────────
      const qParent = mkQ([0, 0, 1], 45);
      const qChild = mkQ([1, 0, 0], 30);
      applyOnTPose({ leftUpperArm: qParent, leftLowerArm: qChild });
      const childDelta = rawWorldDelta('leftLowerArm');
      const parentDelta = rawWorldDelta('leftUpperArm');
      // Normalized convention: child normalized world = qParent * qChild, and
      // the raw world delta should match that composition.
      const composed = qParent.clone().multiply(qChild);
      const probeC = {
        set_parent: qArr(qParent),
        set_child: qArr(qChild),
        measured_parentWorldDelta: qArr(parentDelta),
        measured_childWorldDelta: qArr(childDelta),
        predicted_childWorldDelta: qArr(composed),
        parentError_deg: angleBetween(qParent, parentDelta),
        childError_deg: angleBetween(composed, childDelta),
      };
      clearProbe({ leftUpperArm: qParent, leftLowerArm: qChild });

      // ── Probe D: bind-pose world rotations from skeleton.boneInverses ─────
      // boneInverses[i] = inverse of bone i's world matrix at bind time. If the
      // bind world rotation equals the T-pose raw world measured above, then
      // three-vrm's normalized-identity pose reproduces the bind pose exactly —
      // and a Blender world-delta-from-rest maps 1:1 onto normalized space.
      let skinned = null;
      vrm.scene.traverse((o) => {
        if (!skinned && o.isSkinnedMesh) skinned = o;
      });
      const probeD = {};
      if (skinned) {
        const M = skinned.bindMatrix.constructor; // Matrix4 without a THREE export
        for (const b of PROBE_BONES) {
          const r = getRaw(b);
          const idx = skinned.skeleton.bones.indexOf(r);
          if (idx === -1) continue;
          const bindWorld = new M().copy(skinned.skeleton.boneInverses[idx]).invert();
          const bq = new Q().setFromRotationMatrix(bindWorld);
          probeD[b] = {
            bindWorld: qArr(bq),
            tPoseRawWorld: qArr(tPoseRawWorld[b]),
            bindVsTPose_deg: angleBetween(bq, tPoseRawWorld[b]),
          };
        }
      }

      // Restore the natural pose so the viewer is left exactly as found.
      for (const [b, q] of Object.entries(savedPose)) h.getNormalizedBoneNode(b).quaternion.copy(q);
      h.update();
      vrm.scene.updateWorldMatrix(true, true);

      return {
        vrm: { metaVersion: vrm.meta?.metaVersion ?? '0', sceneRotationY: +vrm.scene.rotation.y.toFixed(4) },
        naturalPose,
        tPose,
        probeB,
        probeC,
        probeD,
      };
    });

    mkdirSync(resolve(dirname(OUT)), { recursive: true });
    writeFileSync(resolve(OUT), JSON.stringify(report, null, 2));

    console.log('\n=== GROUND TRUTH ===');
    console.log(`VRM metaVersion=${report.vrm.metaVersion} scene.rotation.y=${report.vrm.sceneRotationY}`);
    console.log("\nT-pose check (all normalized locals = identity → raw bone world should be identity):");
    for (const [b, t] of Object.entries(report.tPose)) {
      console.log(`  ${b.padEnd(14)} identityErr=${t.identityError_deg}°  rawWorld=${JSON.stringify(t.rawWorld)}`);
    }
    console.log('\nProbe B (set normalized local on T-pose → measured raw WORLD delta):');
    for (const p of report.probeB) {
      console.log(`  ${p.label.padEnd(14)} err=${p.predictionError_deg}°  measured=${JSON.stringify(p.measured_rawWorldDelta)}`);
    }
    console.log('\nProbe C (chain): parentErr=' + report.probeC.parentError_deg + '° childErr=' + report.probeC.childError_deg + '°');
    console.log('\nProbe D (bind world vs T-pose raw world — 0° = bind reproduced by normalized identity):');
    for (const [b, d] of Object.entries(report.probeD)) {
      console.log(`  ${b.padEnd(14)} bindVsTPose=${d.bindVsTPose_deg}°  bind=${JSON.stringify(d.bindWorld)}`);
    }
    console.log(`\nreport: ${OUT}`);
  } catch (e) {
    failed = e;
  } finally {
    if (failed) {
      console.error('\n=== FAILED ===\n' + (failed.stack || failed.message));
      console.error('\n--- viewer logs (tail) ---\n' + logs.slice(-25).join('\n'));
    }
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
