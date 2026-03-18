import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../context/AppContext.tsx';
import ThemeController from './ThemeController.tsx';

const mockUseCompanion = vi.fn();

vi.mock('../../context/CompanionContext.tsx', () => ({
  useCompanion: () => mockUseCompanion(),
}));

describe('ThemeController', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-mode');
    document.documentElement.style.colorScheme = '';
    mockUseCompanion.mockReset();
  });

  it('applies a persona-specific theme override over the app default', async () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ themePreference: 'auto' }));
    mockUseCompanion.mockReturnValue({
      activePersona: {
        id: 'persona-reina',
        themePreference: 'tokyo-night',
      },
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(
      <AppProvider>
        <ThemeController />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('tokyo-night');
      expect(document.documentElement.dataset.themeMode).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
  });

  it('falls back to the app theme when no persona override exists', async () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ themePreference: 'catppuccin-latte' }));
    mockUseCompanion.mockReturnValue({
      activePersona: {
        id: 'persona-reina',
      },
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(
      <AppProvider>
        <ThemeController />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('catppuccin-latte');
      expect(document.documentElement.dataset.themeMode).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });
});
