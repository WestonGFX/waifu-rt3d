/**
 * Mixamo batch downloader — drives an already-open, already-logged-in Chrome over CDP
 * to download a list of animations as FBX (Without Skin, 30fps), ready for the Blender
 * bake pipeline (tools/bake_animation.py).
 *
 * Mixamo is login-walled (Adobe), so this connects to a Chrome the USER launched with
 * --remote-debugging-port=9222 and logged into — it never handles credentials.
 *
 * Prereq:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --remote-debugging-port=9222 --user-data-dir=/tmp/mixamo-chrome-profile https://www.mixamo.com
 *   (then log in, leave it on the animation grid)
 *
 * Usage:
 *   node tools/mixamo_grab.mjs                 # default companion+locomotion sweep
 *   node tools/mixamo_grab.mjs "Waving" "Idle" # explicit search terms
 *
 * Downloads land in ~/Downloads/mixamo-fbx/<slug>.fbx.
 */
import { chromium } from '/Users/chris/Code/waifu-rt3d/frontends/sakura/node_modules/playwright/index.mjs';
import { readdirSync, statSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DL_DIR = join(homedir(), 'Downloads', 'mixamo-fbx');
if (!existsSync(DL_DIR)) mkdirSync(DL_DIR, { recursive: true });

// Default "big sweep" — idles, companion gestures, reactions, locomotion.
const DEFAULT_TERMS = [
  // idles
  'Idle', 'Breathing Idle', 'Happy Idle', 'Bored', 'Looking Around', 'Standing Idle',
  // gestures
  'Waving', 'Talking', 'Thinking', 'Head Nod Yes', 'Shaking Head No',
  'Hands Forward Gesture', 'Blow A Kiss', 'Clapping', 'Shrugging', 'Pointing',
  'Salute', 'Standing Greeting',
  // reactions / emotion
  'Happy', 'Excited', 'Crying', 'Laughing', 'Yawn',
  // locomotion / posture
  'Walking', 'Running', 'Sitting', 'Stand Up', 'Jumping',
];

const terms = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TERMS;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const fbxFiles = () => readdirSync(DL_DIR).filter((f) => f.toLowerCase().endsWith('.fbx'));

/** Wait until a new .fbx appears in DL_DIR and its size stops growing. */
async function waitForDownload(before, page, timeoutMs = 45000) {
  const start = Date.now();
  let last = null;
  let lastSize = -1;
  while (Date.now() - start < timeoutMs) {
    const now = fbxFiles().filter((f) => !before.has(f));
    if (now.length) {
      const f = now[0];
      const sz = statSync(join(DL_DIR, f)).size;
      if (sz > 0 && sz === lastSize) return f; // size stabilized
      lastSize = sz;
      last = f;
    }
    await page.waitForTimeout(1000);
  }
  return last; // may be a partial; caller logs
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes('mixamo.com')) || ctx.pages()[0];
  await page.bringToFront();

  // Route downloads to our folder.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DL_DIR,
    eventsEnabled: true,
  });

  const results = [];
  for (const term of terms) {
    try {
      // dismiss any leftover modal
      await page.locator('button:has-text("Cancel")').first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);

      // search — Enter is REQUIRED. Mixamo's search input does not filter on the React
      // onChange/debounce alone; without submitting, the grid stays on the unfiltered
      // default and every term clicks the same first default tile (the 2026-05-31 bug:
      // 28 downloads of one animation). Verified live: type+Enter filters correctly.
      const search = page.locator('input[placeholder="Search"]').first();
      await search.click();
      await search.fill('');
      await search.type(term, { delay: 35 });
      await search.press('Enter');
      await page.waitForTimeout(2600);

      // apply first single animation (skip packs); dispatchEvent bypasses the sticky
      // search-options bar that overlaps the top tile. (This click works correctly —
      // the 2026-05-31 duplicate bug was the missing search Enter above, now fixed.)
      const tile = page.locator('.product.product-animation').first();
      if (!(await tile.count())) {
        results.push(`SKIP  ${term} — no single-animation result`);
        continue;
      }
      await tile.dispatchEvent('click');
      await page.waitForTimeout(4200); // let the motion load onto the character

      // open download modal
      await page.locator('button.btn-primary:has-text("Download")').first().click({ timeout: 8000 });
      await page.waitForTimeout(1800);

      // settings: Format(0)=FBX Binary [default], Skin(1)=Without Skin, FPS(2)=30, Keyframe(3)=none
      const selects = page.locator('.modal-content select, .modal select');
      await selects.nth(1).selectOption({ label: 'Without Skin' }).catch(() => {});
      await selects.nth(2).selectOption({ label: '30' }).catch(() => {});

      const before = new Set(fbxFiles());
      await page.locator('.modal-content button:has-text("Download"), .modal button:has-text("Download")').last().click();

      const got = await waitForDownload(before, page);
      if (got) {
        const target = `${slug(term)}.fbx`;
        try { renameSync(join(DL_DIR, got), join(DL_DIR, target)); } catch { /* name clash ok */ }
        results.push(`OK    ${term} -> ${target}`);
      } else {
        results.push(`FAIL  ${term} — no file appeared`);
      }
      console.log(results[results.length - 1]);
    } catch (e) {
      results.push(`ERR   ${term} — ${e.message.split('\n')[0]}`);
      console.log(results[results.length - 1]);
      await page.locator('button:has-text("Cancel")').first().click({ timeout: 1000 }).catch(() => {});
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(results.join('\n'));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n${ok}/${terms.length} downloaded → ${DL_DIR}`);

  // Duplicate-download guard: every clip sharing an exact byte size is the signature of
  // the 2026-05-31 bug (one animation saved under many names). Mixamo clips have distinct
  // lengths, so identical sizes en masse means selection never changed.
  const sizes = fbxFiles().map((f) => statSync(join(DL_DIR, f)).size);
  const bySize = sizes.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
  const worst = [...bySize.values()].reduce((a, b) => Math.max(a, b), 0);
  if (worst >= 3) {
    console.log(
      `\n⚠ DUPLICATE WARNING: ${worst} FBX share an identical byte size — likely the SAME ` +
      `clip saved under different names. The search/selection step is not changing the ` +
      `applied animation. See docs/research/2026-05-31-mixamo-duplicate-downloads.md.`,
    );
  }
  await browser.close(); // detach CDP, leave Chrome open
})();
