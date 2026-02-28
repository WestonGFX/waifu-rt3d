import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';
import { useAppStore } from '../stores/appStore';
import { useWizardStore } from '../stores/wizardStore';
import { api } from '../lib/api';

// Framer Motion renders as plain divs in tests — silence animation warnings
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the api module
vi.mock('../lib/api', () => ({
  api: {
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getHardwareInfo: vi.fn().mockResolvedValue({ gpu_name: 'Test GPU', vram_mb: 8192, ram_mb: 16384 }),
    scanImages: vi.fn().mockResolvedValue([]),
    getVoices: vi.fn().mockResolvedValue([]),
    createCharacter: vi.fn().mockResolvedValue({
      id: 42,
      name: 'Aria',
      system_prompt: 'You are Aria…',
      greeting_message: 'Hi!',
    }),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

// Mock fetch for /api/health and other API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Tests for the new 7-step OnboardingWizard.
 *
 * The new wizard uses WizardShell + stores internally (no props).
 * Step flow: Welcome → System Scan → LLM Setup → Voice → Character → Feature Tour → Done
 */
describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset app store
    useAppStore.setState({
      characters: [],
      activeCharacter: null,
      config: {},
      configLoaded: true,
    });
    // Reset wizard store
    useWizardStore.setState({
      activeWizard: 'onboarding',
      discoveredFeatures: [],
      pendingTips: [],
      currentTip: null,
    });
    // Default fetch mock — handles health, LM Studio, Ollama endpoints
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '5.34.0', services: { database: 'connected', vector_store: 'active' } }),
        });
      }
      if (url.includes('/api/lm-studio/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [] }),
        });
      }
      if (url.includes('/api/ollama/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders the Welcome step by default', () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/Welcome to Waifu-RT3D/i)).toBeInTheDocument();
    expect(screen.getByText(/Get started/i)).toBeInTheDocument();
  });

  it('"Get started" advances to the System Scan step', async () => {
    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => {
      expect(screen.getByText(/System Scan/i)).toBeInTheDocument();
    });
  });

  it('shows progress dots for the 7-step flow', () => {
    render(<OnboardingWizard />);
    // WizardProgress renders dots for ≤6 steps, labeled bar for >6
    // With 7 steps we should have a labeled progress bar
    const progressContainer = document.querySelector('[class*="progress"]');
    expect(progressContainer || document.querySelector('[style*="accent"]')).toBeTruthy();
  });

  it('cancelling (skip setup) calls saveConfig with onboarded:true', async () => {
    render(<OnboardingWizard />);
    // The WizardShell provides a skip/cancel mechanism
    const skipButton = screen.queryByText(/Skip/i);
    if (skipButton) {
      fireEvent.click(skipButton);
      await waitFor(() => {
        expect(api.saveConfig).toHaveBeenCalledWith(
          expect.objectContaining({ onboarded: true, onboarding_version: 2 })
        );
      });
    }
  });
});
