import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { useAppStore } from '../stores/appStore';
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
    createCharacter: vi.fn().mockResolvedValue({
      id: 42,
      name: 'Aria',
      system_prompt: 'You are Aria…',
      greeting_message: 'Hi!',
    }),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

// Mock fetch for /api/health
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Tests for OnboardingWizard component.
 * Verifies step navigation, LLM config save, character creation, and completion.
 */
describe('OnboardingWizard', () => {
  const mockComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset app store to a fresh state (no characters, not onboarded)
    useAppStore.setState({
      characters: [],
      activeCharacter: null,
      config: {},
      configLoaded: true,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ services: { llm: 'connected' } }),
    });
  });

  it('renders the Welcome step by default', () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    expect(screen.getByText(/Welcome to Waifu-RT3D/i)).toBeInTheDocument();
    expect(screen.getByText(/Get started/i)).toBeInTheDocument();
  });

  it('"Get started" advances to the Connect LLM step', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => {
      expect(screen.getByText(/Connect your LLM/i)).toBeInTheDocument();
    });
  });

  it('"Skip for now" on the LLM step advances to Create Character', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => screen.getByText(/Connect your LLM/i));
    fireEvent.click(screen.getByText(/Skip for now/i));
    await waitFor(() => {
      expect(screen.getByText(/Create your first character/i)).toBeInTheDocument();
    });
  });

  it('"Skip setup" (top-right) calls saveConfig({onboarded:true}) and onComplete', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Skip setup/i));
    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ onboarded: true }));
      expect(mockComplete).toHaveBeenCalled();
    });
  });

  it('selecting a provider preset updates endpoint URL in the input', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => screen.getByText(/Connect your LLM/i));

    // Ollama preset should set endpoint to http://localhost:11434/v1
    fireEvent.click(screen.getByText('Ollama'));
    const endpointInput = screen.getByPlaceholderText(/http:\/\/localhost/i) as HTMLInputElement;
    expect(endpointInput.value).toContain('11434');
  });

  it('selecting a character preset fills in the name input', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => screen.getByText(/Connect your LLM/i));
    fireEvent.click(screen.getByText(/Skip for now/i));
    await waitFor(() => screen.getByText(/Create your first character/i));

    // Click the Kai preset card
    fireEvent.click(screen.getByText('Kai'));
    const nameInput = screen.getByPlaceholderText(/Give your character a name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Kai');
  });

  it('completing the character step calls api.createCharacter with name and system_prompt', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => screen.getByText(/Connect your LLM/i));
    fireEvent.click(screen.getByText(/Skip for now/i));
    await waitFor(() => screen.getByText(/Create your first character/i));

    // Pick Aria preset and click Create (use role to avoid matching the heading text)
    fireEvent.click(screen.getByText('Aria'));
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(api.createCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Aria',
          system_prompt: expect.stringContaining('Aria'),
        })
      );
    });
  });

  it('the Done step shows and "Start chatting" calls saveConfig({onboarded:true})', async () => {
    render(<OnboardingWizard onComplete={mockComplete} />);

    // Walk through all steps
    fireEvent.click(screen.getByText(/Get started/i));
    await waitFor(() => screen.getByText(/Connect your LLM/i));
    fireEvent.click(screen.getByText(/Skip for now/i));
    await waitFor(() => screen.getByText(/Create your first character/i));
    fireEvent.click(screen.getByText(/Skip for now/i));
    await waitFor(() => screen.getByText(/You're all set/i));

    fireEvent.click(screen.getByText(/Start chatting/i));

    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ onboarded: true })
      );
      expect(mockComplete).toHaveBeenCalled();
    });
  });
});
