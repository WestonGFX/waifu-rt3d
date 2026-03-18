import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SetupWizard from './SetupWizard.tsx';

const mockUseSettings = vi.fn();
const mockUseApp = vi.fn();

vi.mock('../../context/SettingsContext.tsx', () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock('../../context/AppContext.tsx', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../../providers/registry.ts', () => ({
  getLLMProvider: () => ({ requiresApiKey: false, label: 'Ollama' }),
  listLLMProviders: () => [{ name: 'ollama', label: 'Ollama' }],
}));

vi.mock('../../services/apiKeyService.ts', () => ({
  setKey: vi.fn(),
  hasKey: vi.fn(() => false),
}));

vi.mock('../../services/providerHealthService.ts', () => ({
  testLLMConnection: vi.fn(),
}));

describe('SetupWizard', () => {
  it('keeps the wizard card full width while constraining only the inner content', () => {
    mockUseSettings.mockReturnValue({
      state: {
        wizardStep: 0,
        selectedVoiceName: 'default',
      },
      dispatch: vi.fn(),
    });

    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
          stt: { primary: 'browser', fallbacks: [], fallbackTriggers: [], timeoutMs: 15000 },
          tts: { primary: 'browser', fallbacks: [], fallbackTriggers: [], timeoutMs: 15000 },
          providerOptions: {},
        },
      },
      dispatch: vi.fn(),
    });

    render(<SetupWizard />);

    expect(screen.getByTestId('setup-wizard-shell').className).toContain('w-full');
    expect(screen.getByTestId('setup-wizard-shell').className).toContain('px-3');
    expect(screen.getByTestId('setup-wizard-shell').className).not.toContain('border');
    expect(screen.getByTestId('setup-wizard-shell').className).not.toContain('bg-white/85');
    expect(screen.getByTestId('setup-wizard-shell').className).not.toContain('shadow-');
    expect(screen.getByTestId('setup-wizard-content').className).toContain('max-w-[40rem]');
  });
});
