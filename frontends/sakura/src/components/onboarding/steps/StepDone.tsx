import { motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import type { WizardStepProps } from '../../wizard/WizardShell';

/**
 * Onboarding Step 6: Done / Completion.
 *
 * Animated checkmark + summary text. The "Start chatting" button
 * triggers the wizard's onComplete callback, which sets config.onboarded = true.
 */
export function StepDone({ onNext }: WizardStepProps) {
  const { characters } = useAppStore();

  return (
    <div className="flex flex-col items-center text-center max-w-sm mx-auto px-4">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
        style={{ background: 'var(--color-accent-gradient)', boxShadow: '0 8px 32px var(--color-accent-soft)' }}
      >
        <Check size={36} style={{ color: 'var(--color-accent-text)' }} />
      </motion.div>

      <h2 className="char-name-display mb-3" style={{ color: 'var(--color-text-primary)', fontSize: '1.9rem' }}>
        You're all set!
      </h2>
      <p className="text-sm mb-10" style={{ color: 'var(--color-text-secondary)' }}>
        {characters.length > 0
          ? `${characters[0].name} is ready to chat. You can add more characters, adjust the LLM, and configure voice in Settings anytime.`
          : "You can create characters, connect your LLM, and configure everything in Settings anytime."}
      </p>

      <button
        onClick={onNext}
        className="send-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', boxShadow: '0 4px 18px var(--color-accent-soft)' }}
      >
        Start chatting <ChevronRight size={16} />
      </button>
    </div>
  );
}
