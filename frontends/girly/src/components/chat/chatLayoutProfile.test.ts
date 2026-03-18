import { describe, expect, it } from 'vitest';
import { resolveChatLayoutProfile } from './chatLayoutProfile.ts';

describe('resolveChatLayoutProfile', () => {
  it('keeps wide desktop columns in the full shared-height layout', () => {
    expect(resolveChatLayoutProfile('two-column', 1180, 920, 'none')).toMatchObject({
      compactWorkspace: false,
      veryCompactWorkspace: false,
      headerCompact: false,
      showHeaderInsightPane: true,
      condenseDesktopHeader: true,
      utilityTrayHeightStyle: { height: '75px' },
    });
  });

  it('falls back to a denser header when the desktop chat column gets short or narrow', () => {
    expect(resolveChatLayoutProfile('two-column', 900, 700, 'none')).toMatchObject({
      compactWorkspace: false,
      veryCompactWorkspace: false,
      headerCompact: true,
      showHeaderInsightPane: false,
      condenseDesktopHeader: false,
      utilityTrayHeightStyle: { height: '64px' },
    });
  });

  it('gives desktop settings overlays more height than compact utility trays', () => {
    expect(resolveChatLayoutProfile('two-column', 1100, 840, 'settings').utilityTrayHeightStyle).toEqual({
      height: '706px',
      minHeight: '706px',
      maxHeight: '706px',
    });
    expect(resolveChatLayoutProfile('two-column', 1100, 840, 'utility').utilityTrayHeightStyle).toEqual({
      height: '336px',
      minHeight: '336px',
      maxHeight: '336px',
    });
  });

  it('keeps single-column settings trays naturally sized with only a max-height cap', () => {
    expect(resolveChatLayoutProfile('single-column', 760, 920, 'settings').utilityTrayHeightStyle).toEqual({
      maxHeight: 'min(56dvh, 38rem)',
    });
  });
});
