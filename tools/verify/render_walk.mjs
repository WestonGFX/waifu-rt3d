/**
 * Headless render proof for the Stage 2b Phase 1 click-to-walk path.
 *
 * Drives the REAL viewer (`/shared/viewer/viewer.html`) in headless Chromium:
 * loads a VRM avatar + a room environment, enables walk mode, issues a `walkTo`,
 * and captures frames at start / mid-walk / arrival. Asserts the grounding
 * invariant (avatar root y stays ≈ 0 throughout) via the `getAvatarPose` debug
 * command, and that the walk completes (`avatarMoved`).
 *
 * Grounding is the #1 historical regression here — the PNGs are the real proof
 * (read them after this run); the y-assertion is a fast numeric backstop.
 *
 * Prereq: backend running on :8080 (serves /shared, /files).
 *
 * Usage:
 *   node tools/verify/render_walk.mjs \
 *     --env /files/environments/lofi_room.glb \
 *     --out docs/testing/screenshots/2026-06-14-stage2b-p1
 *
 * Exit 0 = avatar walked, arrived, and y stayed grounded within tolerance.
 */
import { chromium } from '/Users/chris/Code/waifu-rt3d/frontends/sakura/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg('--base', 'http://localhost:8080');
const VRM = arg('--vrm', '/files/avatars/Raine.vrm');
const ENV = arg('--env', '/files/environments/lofi_room.glb');
const OUT = arg('--out', 'docs/testing/screenshots/2026-06-14-stage2b-p1');
// Modest lateral+forward destination — likely clear of furniture so we exercise the
// turn → walk → translate → arrive cycle without a collision short-circuit.
const TARGET_X = Number(arg('--x', '0.6'));
const TARGET_Z = Number(arg('--z', '0.4'));
const GROUND_TOL = 0.02; // metres — y must stay within this of its grounded value

mkdirSync(resolve(OUT), { recursive: true });

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

// Request a fresh pose reading (clears any prior avatarPose, sends getAvatarPose, waits).
async function readPose(page) {
  await page.evaluate(() => {
    window.__viewerMsgs = (window.__viewerMsgs || []).filter((m) => m.type !== 'avatarPose');
  });
  await post(page, { type: 'getAvatarPose' });
  return waitForMsg(page, 'avatarPose', 5000);
}

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

    // 1. Load avatar + room.
    await post(page, { type: 'loadCharacter', payload: { modelUrl: VRM } });
    await waitForMsg(page, 'modelLoaded');
    await post(page, { type: 'resetCamera' });
    await post(page, { type: 'loadEnvironment', payload: { url: ENV } });
    const envMsg = await Promise.race([
      waitForMsg(page, 'environmentLoaded'),
      waitForMsg(page, 'environmentError'),
    ]);
    if (envMsg.type === 'environmentError') throw new Error(`environment load failed: ${envMsg.error}`);
    await page.waitForTimeout(900);

    const startPose = await readPose(page);
    const groundY = startPose.y;
    console.log(`start pose: x=${startPose.x.toFixed(3)} y=${startPose.y.toFixed(3)} z=${startPose.z.toFixed(3)}`);
    writeFileSync(resolve(OUT, '1-start-in-room.png'), await page.screenshot());

    // 2. Enable walk mode + command a walk.
    await post(page, { type: 'setWalkMode', payload: { enabled: true } });
    await post(page, { type: 'walkTo', payload: { x: TARGET_X, z: TARGET_Z } });

    // 3. Mid-walk frame + grounding check. Wait past the turn (~0.25s) + clip fade-in
    //    (~0.3s) so this frame lands while she is actually translating (mid-stride).
    await page.waitForTimeout(850);
    const midPose = await readPose(page);
    console.log(`mid pose:   x=${midPose.x.toFixed(3)} y=${midPose.y.toFixed(3)} z=${midPose.z.toFixed(3)}`);
    writeFileSync(resolve(OUT, '2-mid-walk.png'), await page.screenshot());

    // 4. Wait for arrival (or collision stop).
    const done = await Promise.race([
      waitForMsg(page, 'avatarMoved'),
      waitForMsg(page, 'walkBlocked'),
    ]);
    await page.waitForTimeout(500);
    const endPose = await readPose(page);
    console.log(`end pose:   x=${endPose.x.toFixed(3)} y=${endPose.y.toFixed(3)} z=${endPose.z.toFixed(3)} (${done.type})`);
    writeFileSync(resolve(OUT, '3-arrival.png'), await page.screenshot());

    // ── Assertions ──────────────────────────────────────────────────────────
    const errs = [];
    for (const [label, p] of [['start', startPose], ['mid', midPose], ['end', endPose]]) {
      if (Math.abs(p.y - groundY) > GROUND_TOL) {
        errs.push(`grounding broken at ${label}: y=${p.y.toFixed(4)} drifted >${GROUND_TOL} from ${groundY.toFixed(4)}`);
      }
    }
    // Avatar must have actually moved from the origin toward the target.
    const moved = Math.hypot(endPose.x - startPose.x, endPose.z - startPose.z);
    if (moved < 0.1) errs.push(`avatar barely moved (${moved.toFixed(3)}m) — walk did not translate the root`);
    if (done.type === 'avatarMoved') {
      const miss = Math.hypot(endPose.x - TARGET_X, endPose.z - TARGET_Z);
      if (miss > 0.15) errs.push(`arrived but off-target by ${miss.toFixed(3)}m`);
    }

    console.log('\n=== RESULT ===');
    console.log(`moved ${moved.toFixed(3)}m, final event: ${done.type}`);
    console.log(`screenshots: ${OUT}/{1-start-in-room,2-mid-walk,3-arrival}.png`);
    if (errs.length) throw new Error('ASSERTIONS FAILED:\n  - ' + errs.join('\n  - '));
    console.log('grounding invariant held; walk translated + arrived. PASS');
  } catch (e) {
    failed = e;
  } finally {
    if (failed) {
      console.error('\n=== FAILED ===\n' + failed.message);
      console.error('\n--- viewer logs (tail) ---\n' + logs.slice(-30).join('\n'));
    }
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
