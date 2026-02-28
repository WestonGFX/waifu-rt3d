import type { ReactNode } from 'react';

interface WizardStepCardProps {
  /** Step title displayed at the top of the card. */
  title?: string;
  /** Optional subtitle / description below the title. */
  subtitle?: string;
  /** Main content area. */
  children: ReactNode;
  /** Footer area (typically navigation buttons). */
  footer?: ReactNode;
}

/**
 * Content card layout for wizard steps.
 *
 * Provides consistent spacing, title/subtitle placement, and a
 * footer slot for Next/Back/Skip buttons. Used by both onboarding
 * steps and standalone setup wizards.
 */
export function WizardStepCard({ title, subtitle, children, footer }: WizardStepCardProps) {
  return (
    <div className="w-full max-w-lg mx-auto px-4">
      {title && (
        <h2
          className="char-name-display mb-1"
          style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
          {subtitle}
        </p>
      )}
      <div>{children}</div>
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}
