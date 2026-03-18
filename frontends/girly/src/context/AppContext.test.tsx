import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, useApp } from './AppContext.tsx';

function AppProbe() {
  const { state, dispatch } = useApp();

  return (
    <div>
      <div data-testid="setup">{String(state.setupComplete)}</div>
      <div data-testid="active-tray">{state.activeUtilityTray ?? 'none'}</div>
      <div data-testid="header-overview">{String(state.workspacePanelPreferences.headerModules?.overview)}</div>
      <div data-testid="header-focus">{String(state.workspacePanelPreferences.headerModules?.focus)}</div>
      <div data-testid="header-actions">{String(state.workspacePanelPreferences.headerModules?.actions)}</div>
      <div data-testid="header-mode">{state.headerInsightMode}</div>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_SETUP_COMPLETE', payload: true })}
      >
        complete-setup
      </button>
      <button
        type="button"
        onClick={() => dispatch({
          type: 'SET_WORKSPACE_PANEL_PREFERENCES',
          payload: {
            ...state.workspacePanelPreferences,
            headerModules: {
              overview: false,
              focus: false,
              actions: true,
            },
          },
        })}
      >
        invalid-header-modules
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_HEADER_INSIGHT_MODE', payload: 'actions' })}
      >
        set-actions-mode
      </button>
    </div>
  );
}

describe('AppContext persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores setupComplete from persisted state', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true }));

    render(
      <AppProvider>
        <AppProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId('setup').textContent).toBe('true');
  });

  it('starts with settings tray active while setup is incomplete', () => {
    render(
      <AppProvider>
        <AppProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId('setup').textContent).toBe('false');
    expect(screen.getByTestId('active-tray').textContent).toBe('settings');
  });

  it('persists setupComplete updates', async () => {
    render(
      <AppProvider>
        <AppProbe />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'complete-setup' }));

    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem('animegirly_state') ?? '{}');
      expect(parsed.setupComplete).toBe(true);
    });
  });

  it('normalizes invalid header module visibility and preserves context visibility', async () => {
    render(
      <AppProvider>
        <AppProbe />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'invalid-header-modules' }));

    await waitFor(() => {
      expect(screen.getByTestId('header-overview').textContent).toBe('true');
      expect(screen.getByTestId('header-focus').textContent).toBe('false');
      expect(screen.getByTestId('header-actions').textContent).toBe('true');
    });
  });

  it('falls back from actions mode when the actions module is hidden', async () => {
    localStorage.setItem('animegirly_state', JSON.stringify({
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
      headerInsightMode: 'actions',
    }));

    render(
      <AppProvider>
        <AppProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId('header-mode').textContent).toBe('companion');
  });
});
