import { motion } from 'framer-motion';

interface WizardStepProps {
  children: React.ReactNode;
  direction?: 'left' | 'right';
}

/** Animated wizard step container with Framer Motion slide transitions. */
export function WizardStep({ children, direction = 'left' }: WizardStepProps) {
  const x = direction === 'left' ? 100 : -100;
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
