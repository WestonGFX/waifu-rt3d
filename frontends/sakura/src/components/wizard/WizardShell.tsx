import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { WizardProgress } from './WizardProgress';
import { useWizardStore } from '../../stores/wizardStore';

/* ── Types ────────────────────────────────────────────────────────────── */

/** Definition for a single wizard step. */
export interface WizardStepDef {
  /** Unique step identifier. */
  id: string;
  /** Display title (used in labeled progress bar). */
  title: string;
  /** Step content rendered inside the animated container (React component, not a plain function). */
  component: React.ComponentType<WizardStepProps>;
  /** Whether the user can skip this step (shows Skip button). */
  skippable?: boolean;
}

/** Props passed to each step component by WizardShell. */
export interface WizardStepProps {
  /** Advance to the next step. */
  onNext: () => void;
  /** Go back one step. */
  onBack: () => void;
  /** Skip this step (same as onNext but semantically different). */
  onSkip: () => void;
  /** Shared data bag for passing state between steps (e.g. hardware scan results). */
  wizardData: Record<string, unknown>;
  /** Update the shared data bag. */
  setWizardData: (patch: Record<string, unknown>) => void;
}

/** Visual variant controlling the wizard's layout and positioning. */
export type WizardVariant = 'fullscreen' | 'modal' | 'drawer';

interface WizardShellProps {
  /** Ordered list of step definitions. */
  steps: WizardStepDef[];
  /** Visual variant: fullscreen (onboarding), modal (setup wizards), drawer (bottom sheet). */
  variant: WizardVariant;
  /** Called when the wizard completes (user finishes the last step). */
  onComplete: () => void;
  /** Called when the user cancels/closes the wizard. */
  onCancel?: () => void;
  /** Show the progress indicator. Default: true. */
  showProgress?: boolean;
  /** Optional title shown in the modal/drawer header. */
  title?: string;
}

/* ── Animation variants ───────────────────────────────────────────────── */

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

/* ── WizardShell ──────────────────────────────────────────────────────── */

/**
 * Shared container for all wizard flows.
 *
 * Handles step navigation, animation direction, progress display,
 * and chrome (back/skip/close buttons). Steps receive callbacks
 * and a shared data bag for inter-step communication.
 *
 * @example
 * ```tsx
 * <WizardShell
 *   steps={[
 *     { id: 'welcome', title: 'Welcome', component: StepWelcome },
 *     { id: 'setup', title: 'Setup', component: StepSetup, skippable: true },
 *   ]}
 *   variant="modal"
 *   onComplete={() => console.log('done!')}
 * />
 * ```
 */
export function WizardShell({
  steps,
  variant,
  onComplete,
  onCancel,
  showProgress = true,
  title,
}: WizardShellProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [wizardData, setWizardDataState] = useState<Record<string, unknown>>({});

  const isLastStep = step === steps.length - 1;
  const isFirstStep = step === 0;
  const currentStepDef = steps[step];

  const goNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setDirection(1);
    setStep(s => s + 1);
  }, [isLastStep, onComplete]);

  const goBack = useCallback(() => {
    if (isFirstStep) return;
    setDirection(-1);
    setStep(s => s - 1);
  }, [isFirstStep]);

  const goSkip = useCallback(() => {
    goNext();
  }, [goNext]);

  const setWizardData = useCallback((patch: Record<string, unknown>) => {
    setWizardDataState(prev => ({ ...prev, ...patch }));
  }, []);

  // ESC key closes the wizard
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  const stepLabels = steps.map(s => s.title);

  // Render step as a proper React element (not a function call) so each
  // step gets its own hook scope — prevents Rules of Hooks violation when
  // switching between steps with different hook counts.
  const StepComponent = currentStepDef.component;
  const stepContent = (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={currentStepDef.id}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <StepComponent
          onNext={goNext}
          onBack={goBack}
          onSkip={goSkip}
          wizardData={wizardData}
          setWizardData={setWizardData}
        />
      </motion.div>
    </AnimatePresence>
  );

  /* ── Fullscreen variant (onboarding) ──────────────────────────────── */
  if (variant === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        {/* Back button */}
        {!isFirstStep && !isLastStep && (
          <button
            onClick={goBack}
            className="absolute top-6 left-6 flex items-center gap-1 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <ChevronLeft size={14} /> Back
          </button>
        )}

        {/* Skip all / Cancel */}
        {onCancel && !isLastStep && (
          <button
            onClick={onCancel}
            className="absolute top-6 right-6 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Skip setup
          </button>
        )}

        {/* Step content */}
        <div className="w-full max-w-lg px-4">
          {stepContent}
        </div>

        {/* Progress dots */}
        {showProgress && !isLastStep && (
          <div className="absolute bottom-8">
            <WizardProgress current={step} total={steps.length} labels={stepLabels} />
          </div>
        )}
      </div>
    );
  }

  /* ── Modal variant (setup wizards) ────────────────────────────────── */
  if (variant === 'modal') {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--color-background)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-elevated)',
            maxHeight: '85vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={goBack}
                  className="p-1 rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {title || currentStepDef.title}
              </h3>
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto p-5" style={{ maxHeight: 'calc(85vh - 100px)' }}>
            {stepContent}
          </div>

          {/* Footer with progress */}
          {showProgress && steps.length > 1 && (
            <div
              className="flex justify-center px-5 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--color-border-subtle)' }}
            >
              <WizardProgress current={step} total={steps.length} labels={stepLabels} />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  /* ── Drawer variant (bottom sheet) ────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-[90]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-background)',
          maxHeight: '85vh',
          boxShadow: 'var(--shadow-elevated)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: 'var(--color-border)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={goBack}
                className="p-1 rounded-lg"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {title || currentStepDef.title}
            </h3>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 pb-5" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {stepContent}
        </div>

        {/* Footer with progress */}
        {showProgress && steps.length > 1 && (
          <div
            className="flex justify-center px-5 py-3"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          >
            <WizardProgress current={step} total={steps.length} labels={stepLabels} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── WizardOverlay ────────────────────────────────────────────────────── */

/**
 * Global wizard overlay — renders the currently active wizard.
 *
 * Mounted once in App.tsx / MobileApp.tsx. Reads `activeWizard` from
 * the wizard store and renders the appropriate wizard component.
 * Individual wizard components are lazy-imported by their respective
 * trigger points.
 */
export function WizardOverlay() {
  const activeWizard = useWizardStore(s => s.activeWizard);
  if (!activeWizard) return null;

  // The actual wizard components are rendered by their parent contexts
  // (OnboardingWizard, VoiceSetupWizard, etc.) which check activeWizard
  // and render the appropriate WizardShell. This component serves as a
  // no-op sentinel — the actual rendering is handled by the overlay system.
  return null;
}
