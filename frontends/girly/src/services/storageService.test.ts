import { beforeEach, describe, expect, it } from 'vitest';
import { clearState, loadState, saveState } from './storageService.ts';

describe('storageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('merges writes instead of replacing stored keys', () => {
    saveState({ setupComplete: false, selectedVoiceName: 'default' });
    saveState({ setupComplete: true });

    expect(loadState()).toMatchObject({
      setupComplete: true,
      selectedVoiceName: 'default',
    });
  });

  it('returns an empty object when persisted JSON is malformed', () => {
    localStorage.setItem('animegirly_state', '{not-json');
    expect(loadState()).toEqual({});
  });

  it('clearState removes the persisted app state', () => {
    saveState({ setupComplete: true });
    clearState();
    expect(loadState()).toEqual({});
  });

  it('migrates older layout schema state to the recovery defaults', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({
      layoutSchemaVersion: 4,
      themePreference: 'dark',
      shellStylePreference: 'fullscreen',
      desktopViewerWidthPercent: 58,
      settingsPanelHeight: 620,
      workspacePanelPreferences: {
        chats: false,
        context: true,
        settings: false,
      },
      activeUtilityTray: 'context',
    }));

    expect(loadState()).toMatchObject({
      themePreference: 'dark',
      shellStylePreference: 'floating',
      workspacePanelPreferences: {
        chats: true,
        context: true,
        settings: true,
        headerModules: {
          overview: true,
          focus: true,
          actions: false,
        },
      },
      activeUtilityTray: null,
      layoutSchemaVersion: 9,
    });
    expect(loadState().desktopViewerWidthPercent).toBeUndefined();
    expect(loadState().settingsPanelHeight).toBeUndefined();
  });
});
