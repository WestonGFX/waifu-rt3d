import { motion } from 'framer-motion';

interface WizardStepProps {
  children: React.ReactNode;
  /**
   * Slide direction — accepts either a string ('left'/'right') for legacy
   * compatibility with CreateView, or a numeric direction (1/-1) for use
   * with AnimatePresence's `custom` prop in WizardShell.
   */
  direction?: 'left' | 'right' | number;
}

/**
 * Animated wizard step container with Framer Motion slide transitions.
 *
 * Used by CreateView (string direction) and can be used standalone.
 * For WizardShell-managed flows, the shell handles its own AnimatePresence
 * so this component isn't needed — but it remains available for
 * any component that wants a simple animated slide wrapper.
 */
export function WizardStep({ children, direction = 'left' }: WizardStepProps) {
  const x = typeof direction === 'number'
    ? direction > 0 ? 100 : -100
    : direction === 'left' ? 100 : -100;
  return (
    <motion.div
      initial={{ x, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -x, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
