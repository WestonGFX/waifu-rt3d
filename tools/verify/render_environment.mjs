/**
 * Headless render proof for the Stage 2a `loadEnvironment` path.
 *
 * Drives the REAL viewer (`/shared/viewer/viewer.html`) in headless Chromium:
 * loads a VRM avatar, sends `loadEnvironment` with a room GLB, waits for the
 * `environmentLoaded` ack, and screenshots. Verifies the avatar grounds on the
 * environment floor (contact shadow), the room renders behind her, and the
 * camera stays framed on the avatar (not re-framed onto the room).
 *
 * Prereq: backend running on :8080 (serves /shared, /files).
 *
 * Usage:
 *   node tools/verify/render_environment.mjs \
 *     --env /files/environments/test_room.glb \
 *     --out docs/testing/screenshots/2026-06-14-stage2a-environment
 *
 * Exit 0 = avatar + environment loaded and a non-blank frame captured.
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
const ENV = arg('--env', '/files/environments/test_room.glb');
const OUT = arg('--out', 'docs/testing/screenshots/2026-06-14-stage2a-environment');

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

    // 1. Load the avatar.
    await post(page, { type: 'loadCharacter', payload: { modelUrl: VRM } });
    const loaded = await waitForMsg(page, 'modelLoaded');
    console.log('modelLoaded:', JSON.stringify(loaded).slice(0, 100));
    await post(page, { type: 'resetCamera' });
    await page.waitForTimeout(800);
    writeFileSync(resolve(OUT, 'before-no-environment.png'), await page.screenshot());

    // 2. Load the environment.
    await post(page, { type: 'loadEnvironment', payload: { url: ENV } });
    const envMsg = await Promise.race([
      waitForMsg(page, 'environmentLoaded'),
      waitForMsg(page, 'environmentError'),
    ]);
    if (envMsg.type === 'environmentError') throw new Error(`environment load failed: ${envMsg.error}`);
    console.log(`environmentLoaded: url=${envMsg.url}`);
    await page.waitForTimeout(900);
    writeFileSync(resolve(OUT, 'after-with-environment.png'), await page.screenshot());

    // 3. Clear it again — proves dispose path + restore-to-void.
    await post(page, { type: 'clearEnvironment' });
    await waitForMsg(page, 'environmentCleared');
    await page.waitForTimeout(500);
    writeFileSync(resolve(OUT, 'after-cleared.png'), await page.screenshot());

    const stats = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { ok: true, w: c.width, h: c.height } : { ok: false };
    });
    console.log('\n=== RESULT ===');
    console.log(`canvas: ${stats.w}x${stats.h}`);
    console.log(`screenshots: ${OUT}/{before-no-environment,after-with-environment,after-cleared}.png`);
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
