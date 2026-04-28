/**
 * Regression test: BlinkController init order in viewer.html.
 *
 * Session 18 (2026-04-27): The BlinkController constructor called
 * `this._poissonDelay()` BEFORE initializing `this._emotionMod`. Since
 * `_poissonDelay()` reads `this._emotionMod.rateMul`, every model load
 * crashed with:
 *
 *     TypeError: Cannot read properties of undefined (reading 'rateMul')
 *         at BlinkController._poissonDelay
 *         at new BlinkController
 *         at loader.load callback (loadModel success path)
 *
 * The crash happened *inside the GLTFLoader success callback*, so the
 * VRM file loaded fine but the viewer never reached the postMessage
 * `modelLoaded` reply — the parent React app stayed stuck on
 * "Loading 3D model..." forever and the user saw a blank viewer panel.
 *
 * This test reads viewer.html as text and asserts that within the
 * BlinkController constructor, `_emotionMod` is assigned BEFORE the
 * `_poissonDelay()` call. It's a structural test — fragile to renames
 * but cheap and exact about the failure mode it locks in.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWER_HTML = resolve(__dirname, '../../../shared/viewer/viewer.html');

describe('viewer.html · BlinkController constructor', () => {
  const source = readFileSync(VIEWER_HTML, 'utf8');

  it('contains a BlinkController class', () => {
    expect(source).toMatch(/class\s+BlinkController\s*{/);
  });

  it('initializes _emotionMod BEFORE calling _poissonDelay() in the constructor', () => {
    // Slice from the BlinkController class opening to the next class/method
    // boundary marker. The constructor ends before `setEmotion(`.
    const classStart = source.indexOf('class BlinkController');
    const setEmotionStart = source.indexOf('setEmotion(', classStart);
    expect(classStart, 'BlinkController class not found').toBeGreaterThan(-1);
    expect(setEmotionStart, 'setEmotion method not found after class').toBeGreaterThan(-1);

    const ctorRegion = source.slice(classStart, setEmotionStart);
    const emotionModIdx = ctorRegion.indexOf('this._emotionMod = {');
    const poissonIdx = ctorRegion.indexOf('this._poissonDelay()');

    expect(emotionModIdx, '_emotionMod assignment missing in constructor').toBeGreaterThan(-1);
    expect(poissonIdx, 'this._poissonDelay() call missing in constructor').toBeGreaterThan(-1);
    expect(
      emotionModIdx < poissonIdx,
      `_emotionMod must be initialised BEFORE this._poissonDelay() call ` +
      `(found _emotionMod at ${emotionModIdx}, _poissonDelay at ${poissonIdx}). ` +
      `If reordered, every VRM model load will crash with ` +
      `"Cannot read properties of undefined (reading 'rateMul')".`
    ).toBe(true);
  });

  it('_poissonDelay reads this._emotionMod.rateMul', () => {
    // If the formula changes such that _poissonDelay no longer depends on
    // _emotionMod, this whole test becomes unnecessary. That would be fine —
    // the test should fail loudly so we know to delete it.
    expect(source).toMatch(/_poissonDelay\s*\(\s*\)\s*{[\s\S]*?this\._emotionMod\.rateMul/);
  });
});
