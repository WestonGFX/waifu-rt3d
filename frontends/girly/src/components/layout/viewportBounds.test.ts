import { describe, expect, it } from 'vitest';
import { resolveVisibleViewport } from './viewportBounds.ts';

describe('resolveVisibleViewport', () => {
  it('uses the smallest valid browser viewport measurement', () => {
    expect(resolveVisibleViewport({
      innerWidth: 1728,
      clientWidth: 1711,
      visualViewportWidth: 1711.4,
      innerHeight: 1113,
      clientHeight: 1096,
      visualViewportHeight: 1096.2,
    })).toEqual({ width: 1711, height: 1096 });
  });

  it('ignores missing browser APIs and falls back to remaining measurements', () => {
    expect(resolveVisibleViewport({
      innerWidth: 1440,
      innerHeight: 900,
      clientWidth: 0,
      clientHeight: 0,
      visualViewportWidth: 0,
      visualViewportHeight: 0,
    })).toEqual({ width: 1440, height: 900 });
  });

  it('prefers the document client box when visualViewport is larger than the visible page', () => {
    expect(resolveVisibleViewport({
      innerWidth: 1280,
      clientWidth: 1263,
      visualViewportWidth: 1280,
      innerHeight: 832,
      clientHeight: 815,
      visualViewportHeight: 832,
    })).toEqual({ width: 1263, height: 815 });
  });
});
