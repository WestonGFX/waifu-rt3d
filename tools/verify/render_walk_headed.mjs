/**
 * Real-framerate (headed, real-GPU) posture check for Stage 2b click-to-walk.
 *
 * The headless swiftshader harness distorts spring/follow-through physics at its
 * capped, low frame-rate (hair whips past the face, torso appears hunched). This
 * script runs the REAL viewer in a HEADED Chrome on the real GPU so the turn +
 * walk-clip-start play out at ~60fps — the truth test for whether the hunch is a
 * renderer artifact or a real posture bug. Captures a burst of frames DURING the
 * walk (not just at arrival) so mid-stride posture is visible.
 *
 * Prereq: backend running on :8080.
 *
 * Usage: node tools/verify/render_walk_headed.mjs
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
const OUT = arg('--out', 'docs/testing/screenshots/2026-06-14-stage2b-p1/headed');
const TARGET_X = Number(arg('--x', '0.6'));
const TARGET_Z = Number(arg('--z', '0.4'));

mkdirSync(resolve(OUT), { recursive: true });

function waitForMsg(page, wantType, timeoutMs = 25000) {
  return page.evaluate(
    ({ wantType, timeoutMs }) =>
      new Promise((res, rej) => {
        const hit = (window.__viewerMsgs || []).find((m) => m.type === wantType);
        if (hit) return res(hit);
        const onMsg = (e) => {
          if (e.data && e.data.type === wantType) { window.removeEventListener('message', onMsg); res(e.data); }
        };
        window.addEventListener('message', onMsg);
        setTimeout(() => { window.removeEventListener('message', onMsg); rej(new Error(`timeout ${wantType}`)); }, timeoutMs);
      }),
    { wantType, timeoutMs },
  );
}
const post = (page, msg) => page.evaluate((m) => window.postMessage(m, '*'), msg);

(async () => {
  // Headed + real GPU (NO swiftshader) so the render loop runs at native framerate.
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  let failed = null;
  try {
    await page.goto(`${BASE}/shared/viewer/viewer.html`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => {
      window.__viewerMsgs = [];
      window.addEventListener('message', (e) => { if (e.data && e.data.type) window.__viewerMsgs.push(e.data); });
    });
    await post(page, { type: 'setEntranceConfig', payload: { enabled: false } });
    await post(page, { type: 'loadCharacter', payload: { modelUrl: VRM } });
    await waitForMsg(page, 'modelLoaded');
    await post(page, { type: 'resetCamera' });
    await post(page, { type: 'loadEnvironment', payload: { url: ENV } });
    await Promise.race([waitForMsg(page, 'environmentLoaded'), waitForMsg(page, 'environmentError')]);
    await page.waitForTimeout(800);
    writeFileSync(resolve(OUT, 'h0-start.png'), await page.screenshot());

    await post(page, { type: 'setWalkMode', payload: { enabled: true } });
    await post(page, { type: 'walkTo', payload: { x: TARGET_X, z: TARGET_Z } });

    // Burst-capture through the turn + walk at native framerate (every ~120ms).
    for (let i = 1; i <= 9; i++) {
      await page.waitForTimeout(120);
      writeFileSync(resolve(OUT, `h${i}-t${i * 120}ms.png`), await page.screenshot());
    }
    await page.waitForTimeout(700);
    writeFileSync(resolve(OUT, 'h-final.png'), await page.screenshot());

    console.log('\n=== RESULT ===');
    console.log(`headed walk captured: ${OUT}/h0-start.png, h1..h9, h-final.png`);
    // Hold the window briefly so the user can see it live.
    await page.waitForTimeout(2500);
  } catch (e) {
    failed = e;
  } finally {
    if (failed) {
      console.error('\n=== FAILED ===\n' + failed.message);
      console.error('\n--- viewer logs (tail) ---\n' + logs.slice(-25).join('\n'));
    }
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
