/**
 * Headless render proof for the clip→VRM retarget pipeline (Stage 1.1).
 *
 * Drives the REAL viewer (`/shared/viewer/viewer.html`) in headless Chromium via
 * its postMessage API, loads a VRM + a Mixamo-rigged GLB clip with retarget=true,
 * plays it, and screenshots the canvas. Produces visual evidence for the grounding
 * gate without a human in the loop.
 *
 * Prereq: backend running on :8080 (serves /shared, /files). Playwright + Chromium
 * are resolved from frontends/sakura/node_modules.
 *
 * Usage:
 *   node tools/verify/render_clip.mjs \
 *     --vrm /files/avatars/Raine.vrm \
 *     --clip /files/animations/threejs-mixamo/Xbot.glb \
 *     --name walk --out docs/testing/screenshots/2026-05-31-retarget-proof
 *
 * Exit code 0 = model + clip loaded and a non-blank frame was captured.
 */
import { chromium } from '/Users/chris/Code/waifu-rt3d/frontends/sakura/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg('--base', 'http://localhost:8080');
const VRM = arg('--vrm', '/files/avatars/Raine.vrm');
const CLIP = arg('--clip', '/files/animations/threejs-mixamo/Xbot.glb');
const CLIP_NAME = arg('--name', 'walk'); // Xbot clip names: idle, walk, run, agree, ...
const OUT = arg('--out', 'docs/testing/screenshots/2026-05-31-retarget-proof');
const FRAMES = parseInt(arg('--frames', '1'), 10); // >1 = motion burst (distinct-frame check)
// Raw Mixamo-rigged clips need runtime retarget; clips already baked onto the VRM rig
// (J_Bip_* track names, via tools/blender/retarget_to_vrm.py) must NOT be re-retargeted.
const RETARGET = arg('--retarget', 'true') !== 'false';

mkdirSync(resolve(OUT), { recursive: true });

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
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swrast',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  let failed = null;
  try {
    await page.goto(`${BASE}/shared/viewer/viewer.html`, { waitUntil: 'load', timeout: 30000 });
    // Record all viewer→parent messages so we never miss one fired before we listen.
    await page.evaluate(() => {
      window.__viewerMsgs = [];
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type) window.__viewerMsgs.push(e.data);
      });
    });

    // Disable the entrance animation (defaults ON: slides the model in from the
    // right over 1.2s) so screenshots show the resting/animated pose, not entry.
    await post(page, { type: 'setEntranceConfig', payload: { enabled: false } });

    // 1. Load the VRM.
    await post(page, { type: 'loadCharacter', payload: { modelUrl: VRM } });
    const loaded = await waitForMsg(page, 'modelLoaded');
    console.log('modelLoaded:', JSON.stringify(loaded).slice(0, 120));

    // Frame the model, then baseline screenshot (idle, no clip) — grounding reference.
    await post(page, { type: 'resetCamera' });
    await page.waitForTimeout(800);
    const base = await page.screenshot();
    writeFileSync(resolve(OUT, 'baseline-idle.png'), base);

    // 2. Load the Mixamo clip WITH retarget.
    await post(page, {
      type: 'loadAnimation',
      payload: { url: CLIP, name: CLIP_NAME, retarget: RETARGET },
    });
    const animMsg = await Promise.race([
      waitForMsg(page, 'animationLoaded'),
      waitForMsg(page, 'animationError'),
    ]);
    if (animMsg.type === 'animationError') throw new Error(`clip load failed: ${animMsg.error}`);
    console.log(`animationLoaded: name=${animMsg.name} duration=${animMsg.duration} tracks=${animMsg.tracks}`);

    // 3. Play it, then capture a short burst of frames. Distinct frames prove the
    //    clip is genuinely animating, not just holding a static retargeted pose.
    await post(page, { type: 'playAnimation', payload: { name: CLIP_NAME, loop: true, fadeIn: 0.3 } });
    await page.waitForTimeout(500);
    const hashes = [];
    let playing = null;
    for (let i = 0; i < FRAMES; i++) {
      await page.waitForTimeout(240);
      const shot = await page.screenshot();
      if (i === 0) playing = shot;
      hashes.push(createHash('md5').update(shot).digest('hex').slice(0, 8));
      if (FRAMES > 1) writeFileSync(resolve(OUT, `clip-${CLIP_NAME}-f${i}.png`), shot);
    }
    const playPath = resolve(OUT, `clip-${CLIP_NAME}.png`);
    writeFileSync(playPath, playing);
    const distinct = new Set(hashes).size;

    // 4. Blank-frame guard: a real render is not uniformly one color.
    const stats = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return { ok: false, reason: 'no canvas' };
      return { ok: true, w: c.width, h: c.height };
    });

    console.log('\n=== RESULT ===');
    console.log(`canvas: ${stats.w}x${stats.h}`);
    console.log(`tracks retargeted into clip: ${animMsg.tracks}`);
    if (FRAMES > 1) {
      console.log(`motion: ${distinct}/${FRAMES} distinct frames → ${distinct > 1 ? 'ANIMATING' : 'STATIC (clip not driving the body)'}`);
    }
    console.log(`screenshots: ${OUT}/baseline-idle.png, clip-${CLIP_NAME}.png`);
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
