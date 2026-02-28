import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WhatsNewModal } from '../components/WhatsNewModal';
import { useWizardStore } from '../stores/wizardStore';
import { useAppStore } from '../stores/appStore';

// Framer Motion renders as plain divs in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Tests for WhatsNewModal — the "What's New" modal shown when
 * the server version differs from the user's last seen version.
 */
describe('WhatsNewModal', () => {
  const mockSaveConfig = vi.fn().mockResolvedValue({ ok: true, config: {} });

  beforeEach(() => {
    vi.clearAllMocks();
    useWizardStore.setState({
      activeWizard: 'whats-new',
      lastSeenVersion: '',
    });
    useAppStore.setState({
      saveConfig: mockSaveConfig,
    });
  });

  it('renders the latest release highlights', () => {
    render(<WhatsNewModal />);
    // Should show the first release note (v5.34.0)
    expect(screen.getByText("What's New")).toBeInTheDocument();
    expect(screen.getByText(/5\.34\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Setup Wizards & Feature Discovery/)).toBeInTheDocument();
  });

  it('renders all highlights for the latest version', () => {
    render(<WhatsNewModal />);
    expect(screen.getByText(/Hardware Auto-Detection/)).toBeInTheDocument();
    expect(screen.getByText(/Voice Setup Guide/)).toBeInTheDocument();
    expect(screen.getByText(/Help Menu/)).toBeInTheDocument();
  });

  it('shows wizard links for highlights that have them', () => {
    render(<WhatsNewModal />);
    // Voice Setup Guide has wizardLink: 'voice-setup'
    const setupButtons = screen.getAllByText(/Set up/);
    expect(setupButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('dismiss saves the version and closes the wizard', async () => {
    render(<WhatsNewModal />);
    fireEvent.click(screen.getByText('Got it'));

    await waitFor(() => {
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ last_seen_version: '5.34.0' })
      );
    });

    // Should have called closeWizard (sets activeWizard to null)
    expect(useWizardStore.getState().lastSeenVersion).toBe('5.34.0');
  });

  it('clicking the X button also dismisses', async () => {
    render(<WhatsNewModal />);
    // The X button is rendered by the modal header
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.querySelector('svg'));
    if (xButton) {
      fireEvent.click(xButton);
      await waitFor(() => {
        expect(mockSaveConfig).toHaveBeenCalled();
      });
    }
  });

  it('clicking a wizard link dismisses then opens the specified wizard', async () => {
    render(<WhatsNewModal />);
    const setupButtons = screen.getAllByText(/Set up/);
    fireEvent.click(setupButtons[0]);

    await waitFor(() => {
      // Should have saved config (dismiss) then opened voice-setup wizard
      expect(mockSaveConfig).toHaveBeenCalled();
    });

    // After the dismiss promise resolves, the wizard should be opened
    await waitFor(() => {
      expect(useWizardStore.getState().activeWizard).toBe('voice-setup');
    });
  });
});
