import { describe, expect, it } from 'vitest';
import { resolveTwoColumnStageHeight } from './shellStage.ts';

describe('resolveTwoColumnStageHeight', () => {
  it('fills the shared-height shell instead of reserving extra outer breathing room', () => {
    expect(resolveTwoColumnStageHeight(900, 16)).toBe(868);
  });

  it('tracks shorter desktop heights exactly inside the shell bounds', () => {
    expect(resolveTwoColumnStageHeight(620, 16)).toBe(588);
  });

  it('stretches to the full available height on taller desktops', () => {
    expect(resolveTwoColumnStageHeight(1400, 16)).toBe(1368);
  });

  it('does not exceed the available shell height on extremely short windows', () => {
    expect(resolveTwoColumnStageHeight(320, 16)).toBe(288);
  });
});
