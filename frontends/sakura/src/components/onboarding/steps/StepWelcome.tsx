import { motion } from 'framer-motion';
import { MessageCircle, ChevronRight } from 'lucide-react';
import type { WizardStepProps } from '../../wizard/WizardShell';

/**
 * Onboarding Step 0: Welcome screen.
 *
 * Decorative brand icon + heading + single "Get started" CTA.
 * No skipping — this step is the entry point.
 */
export function StepWelcome({ onNext }: WizardStepProps) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm mx-auto px-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
        style={{ background: 'var(--color-accent-gradient)', boxShadow: '0 8px 32px var(--color-accent-soft)' }}
      >
        <MessageCircle size={36} style={{ color: 'var(--color-accent-text)' }} />
      </motion.div>

      <h1 className="char-name-display mb-3" style={{ color: 'var(--color-text-primary)', fontSize: '1.9rem' }}>
        Welcome to Waifu-RT3D
      </h1>
      <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Your AI companion platform. Let's get you set up in a few quick steps.
      </p>
      <p className="text-xs mb-10" style={{ color: 'var(--color-text-tertiary)' }}>
        Scan hardware · Connect your LLM · Set up voice · Create a character
      </p>

      <button
        onClick={onNext}
        className="send-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', boxShadow: '0 4px 18px var(--color-accent-soft)' }}
      >
        Get started <ChevronRight size={16} />
      </button>
    </div>
  );
}
