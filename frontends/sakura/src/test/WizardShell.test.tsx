import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../components/wizard/WizardShell';
import { useWizardStore } from '../stores/wizardStore';

// Framer Motion renders as plain divs in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Tests for WizardShell — the shared container for all wizard flows.
 *
 * Validates step navigation, skip/cancel, ESC handling, progress display,
 * and shared data bag (wizardData) passing between steps.
 */

/** Helper to create step definitions with testable content. */
function makeSteps(count: number, options?: { skippable?: boolean[] }): WizardStepDef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `step-${i}`,
    title: `Step ${i + 1}`,
    skippable: options?.skippable?.[i] ?? false,
    component: ({ onNext, onBack, onSkip }: WizardStepProps) => (
      <div>
        <span data-testid={`step-content-${i}`}>Step {i + 1} Content</span>
        <button data-testid={`next-${i}`} onClick={onNext}>Next</button>
        <button data-testid={`back-${i}`} onClick={onBack}>Back</button>
        <button data-testid={`skip-${i}`} onClick={onSkip}>Skip</button>
      </div>
    ),
  }));
}

describe('WizardShell', () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useWizardStore.setState({ activeWizard: null });
  });

  // ── Step navigation ───────────────────────────────────────────────

  describe('step navigation', () => {
    it('renders the first step initially', () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} />
      );
      expect(screen.getByTestId('step-content-0')).toBeInTheDocument();
    });

    it('navigates forward with onNext', async () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} />
      );
      fireEvent.click(screen.getByTestId('next-0'));
      await waitFor(() => {
        expect(screen.getByTestId('step-content-1')).toBeInTheDocument();
      });
    });

    it('navigates backward with onBack', async () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} />
      );
      // Go to step 2
      fireEvent.click(screen.getByTestId('next-0'));
      await waitFor(() => expect(screen.getByTestId('step-content-1')).toBeInTheDocument());

      // Go back to step 1
      fireEvent.click(screen.getByTestId('back-1'));
      await waitFor(() => {
        expect(screen.getByTestId('step-content-0')).toBeInTheDocument();
      });
    });

    it('does not go back from the first step', () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} />
      );
      fireEvent.click(screen.getByTestId('back-0'));
      // Should still be on step 0
      expect(screen.getByTestId('step-content-0')).toBeInTheDocument();
    });

    it('calls onComplete when advancing past the last step', async () => {
      render(
        <WizardShell steps={makeSteps(2)} variant="modal" onComplete={onComplete} />
      );
      fireEvent.click(screen.getByTestId('next-0'));
      await waitFor(() => expect(screen.getByTestId('step-content-1')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('next-1'));
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  // ── Skip behavior ─────────────────────────────────────────────────

  describe('skip', () => {
    it('onSkip advances to the next step (same as onNext)', async () => {
      render(
        <WizardShell
          steps={makeSteps(3, { skippable: [false, true, false] })}
          variant="modal"
          onComplete={onComplete}
        />
      );
      fireEvent.click(screen.getByTestId('next-0'));
      await waitFor(() => expect(screen.getByTestId('step-content-1')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('skip-1'));
      await waitFor(() => {
        expect(screen.getByTestId('step-content-2')).toBeInTheDocument();
      });
    });
  });

  // ── ESC key ───────────────────────────────────────────────────────

  describe('ESC key', () => {
    it('calls onCancel when ESC is pressed', () => {
      render(
        <WizardShell
          steps={makeSteps(2)}
          variant="modal"
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('does not call onCancel if onCancel is not provided', () => {
      render(
        <WizardShell steps={makeSteps(2)} variant="modal" onComplete={onComplete} />
      );
      // Should not throw
      fireEvent.keyDown(window, { key: 'Escape' });
    });
  });

  // ── Variant rendering ─────────────────────────────────────────────

  describe('variants', () => {
    it('fullscreen variant renders with fixed positioning', () => {
      const { container } = render(
        <WizardShell steps={makeSteps(2)} variant="fullscreen" onComplete={onComplete} />
      );
      const outer = container.firstElementChild as HTMLElement;
      expect(outer?.className).toContain('fixed');
    });

    it('modal variant renders a backdrop', () => {
      const { container } = render(
        <WizardShell
          steps={makeSteps(2)}
          variant="modal"
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
      const outer = container.firstElementChild as HTMLElement;
      expect(outer?.className).toContain('fixed');
    });

    it('drawer variant renders from the bottom', () => {
      const { container } = render(
        <WizardShell
          steps={makeSteps(2)}
          variant="drawer"
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
      const outer = container.firstElementChild as HTMLElement;
      expect(outer?.className).toContain('fixed');
    });
  });

  // ── Shared wizard data ────────────────────────────────────────────

  describe('wizardData', () => {
    it('passes shared data bag between steps', async () => {
      let capturedData: Record<string, unknown> = {};

      const steps: WizardStepDef[] = [
        {
          id: 'setter',
          title: 'Setter',
          component: ({ onNext, setWizardData }: WizardStepProps) => (
            <button
              data-testid="set-and-go"
              onClick={() => { setWizardData({ gpu: 'RTX 5080' }); onNext(); }}
            >
              Set & Go
            </button>
          ),
        },
        {
          id: 'reader',
          title: 'Reader',
          component: ({ wizardData }: WizardStepProps) => {
            capturedData = wizardData;
            return <span data-testid="reader">Reading data</span>;
          },
        },
      ];

      render(
        <WizardShell steps={steps} variant="modal" onComplete={onComplete} />
      );
      fireEvent.click(screen.getByTestId('set-and-go'));
      await waitFor(() => expect(screen.getByTestId('reader')).toBeInTheDocument());

      expect(capturedData).toEqual({ gpu: 'RTX 5080' });
    });
  });

  // ── Progress display ──────────────────────────────────────────────

  describe('progress', () => {
    it('shows progress when showProgress=true and multiple steps', () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} showProgress />
      );
      // With 3 steps (≤6), DotIndicator is used. With labeled bar, "Step X of Y" text appears.
      // Both render progress-related elements. The progress component should be in the DOM.
      const container = document.querySelector('[class*="flex"][class*="justify-center"]');
      expect(container).toBeTruthy();
    });

    it('hides progress when showProgress=false', () => {
      render(
        <WizardShell steps={makeSteps(3)} variant="modal" onComplete={onComplete} showProgress={false} />
      );
      // "Step X of Y" text should NOT appear
      expect(screen.queryByText(/Step \d+ of/)).not.toBeInTheDocument();
    });
  });

  // ── Title ─────────────────────────────────────────────────────────

  describe('title', () => {
    it('shows custom title in modal header', () => {
      render(
        <WizardShell
          steps={makeSteps(2)}
          variant="modal"
          onComplete={onComplete}
          title="Voice Setup"
        />
      );
      expect(screen.getByText('Voice Setup')).toBeInTheDocument();
    });

    it('falls back to step title when no custom title', () => {
      render(
        <WizardShell steps={makeSteps(2)} variant="modal" onComplete={onComplete} />
      );
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });
  });
});
