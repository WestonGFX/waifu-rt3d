import { describe, expect, it } from 'vitest';
import { buildLayoutDebugLines, type LayoutDebugSnapshot } from './layoutDebug.ts';

describe('buildLayoutDebugLines', () => {
  it('includes raw browser viewport metrics alongside computed shell metrics', () => {
    const snapshot: LayoutDebugSnapshot = {
      shellMode: 'split',
      viewportWidth: 1710,
      viewportHeight: 1033,
      contentWidth: 1710,
      contentHeight: 1033,
      shellScrollWidth: 1710,
      shellScrollHeight: 1033,
      actualRenderedOverflowX: 24,
      actualRenderedOverflowY: 0,
      shellHorizontalOverflow: 0,
      shellVerticalOverflow: 0,
      viewerPercent: 40,
      chatMinWidth: 420,
      dpr: 2,
      scale: 1.25,
      windowInnerWidth: 1728,
      windowInnerHeight: 1061,
      documentClientWidth: 1710,
      documentClientHeight: 1033,
      visualViewportWidth: 1710.4,
      visualViewportHeight: 1033.2,
      effectiveViewportWidth: 1710,
      effectiveViewportHeight: 1033,
    };

    expect(buildLayoutDebugLines(snapshot)).toEqual([
      'mode split',
      'window 1728 x 1061',
      'client 1710 x 1033',
      'visual 1710 x 1033',
      'effective 1710 x 1033',
      'viewport 1710 x 1033',
      'content 1710 x 1033',
      'shell 1710 x 1033',
      'overflow 24 x 0',
      'shell overflow 0 x 0',
      'dpr 2.00 | scale 1.25',
      'viewer 40% | chat min 420',
    ]);
  });
});
