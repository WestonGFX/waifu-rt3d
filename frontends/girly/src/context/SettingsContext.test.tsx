import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsProvider, useSettings } from './SettingsContext.tsx';

function SettingsProbe() {
  const { state, dispatch } = useSettings();
  return (
    <div>
      <div data-testid="voice">{state.selectedVoiceName}</div>
      <div data-testid="auto-read">{String(state.autoReadAssistant)}</div>
      <div data-testid="panel-height">{String(state.panelHeight)}</div>
      <div data-testid="viewer-width">{String(state.desktopViewerWidthPercent)}</div>
      <button type="button" onClick={() => dispatch({ type: 'SET_VOICE', payload: 'cheerful' })}>
        set-cheerful
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_AUTO_READ_ASSISTANT', payload: true })}
      >
        set-auto-read
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_PANEL_HEIGHT', payload: 512 })}
      >
        set-panel-height
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_DESKTOP_VIEWER_WIDTH_PERCENT', payload: 64 })}
      >
        set-viewer-width
      </button>
    </div>
  );
}

describe('SettingsContext persistence', () => {
  const expectedPanelClamp = (height: number) => {
    const viewportHeight = window.innerHeight;
    const reservedChatSpace = viewportHeight >= 960 ? 320 : 280;
    const viewportBound = Math.max(320, Math.min(760, viewportHeight - reservedChatSpace));
    return Math.max(320, Math.min(viewportBound, Math.round(height)));
  };

  const expectedViewerWidthClamp = (width: number) => {
    const minPercent = Math.max(32, Math.round((320 / window.innerWidth) * 100));
    const defaultMaxPercent = window.innerWidth >= 1680
      ? 52
      : window.innerWidth >= 1480
        ? 50
        : window.innerWidth >= 1280
          ? 48
          : window.innerWidth >= 1120
            ? 46
            : 42;
    const maxPercent = Math.min(defaultMaxPercent, 100 - Math.round((540 / window.innerWidth) * 100));
    if (minPercent >= maxPercent) {
      return 40;
    }
    return Math.max(minPercent, Math.min(maxPercent, Math.round(width)));
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('restores selected voice from persisted app state', () => {
    localStorage.setItem(
      'animegirly_state',
      JSON.stringify({ selectedVoiceName: 'calm' }),
    );

    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('voice').textContent).toBe('calm');
  });

  it('persists selected voice updates to localStorage', async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-cheerful' }));

    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem('animegirly_state') ?? '{}');
      expect(parsed.selectedVoiceName).toBe('cheerful');
    });
  });

  it('defaults auto-read to false and persists explicit enable', async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('auto-read').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'set-auto-read' }));

    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem('animegirly_state') ?? '{}');
      expect(parsed.autoReadAssistant).toBe(true);
    });
  });

  it('restores and clamps panel height from persisted state', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({
      layoutSchemaVersion: 9,
      settingsPanelHeight: 900,
    }));

    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    const expectedClamp = String(expectedPanelClamp(900));
    expect(screen.getByTestId('panel-height').textContent).toBe(expectedClamp);
  });

  it('persists panel height updates to localStorage', async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-panel-height' }));

    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem('animegirly_state') ?? '{}');
      expect(parsed.settingsPanelHeight).toBe(expectedPanelClamp(512));
    });
  });

  it('persists desktop viewer width updates to localStorage', async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-viewer-width' }));

    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem('animegirly_state') ?? '{}');
      expect(parsed.desktopViewerWidthPercent).toBe(expectedViewerWidthClamp(64));
    });
  });

  it('allows a meaningfully wider viewer split on larger desktops', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-viewer-width' }));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-width').textContent).toBe(String(expectedViewerWidthClamp(64)));
    });
  });
});
