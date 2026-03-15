import { type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import glass from '../styles/glass.module.css';

/**
 * Reusable frosted glass panel primitive.
 *
 * Wraps content in a `backdrop-filter: blur()` container with configurable
 * visual weight, interactivity, and Framer Motion spring entrance animation.
 *
 * This is the foundational building block for all Nova UI surfaces —
 * chat panels, nav pills, input bars, and data widgets all compose from
 * GlassPanel with different prop combinations.
 *
 * @example
 * ```tsx
 * // Standard floating panel with spring entrance
 * <GlassPanel>Content here</GlassPanel>
 *
 * // Strong panel with hover glow, custom delay
 * <GlassPanel variant="strong" interactive delay={0.3}>
 *   <h2>Settings</h2>
 * </GlassPanel>
 *
 * // Pill-shaped badge
 * <GlassPanel variant="pill">Online</GlassPanel>
 * ```
 */
interface GlassPanelProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;

  /** Visual weight of the glass effect. */
  variant?: 'default' | 'strong' | 'pill';

  /** Enable hover glow + press scale effects. */
  interactive?: boolean;

  /** Stagger delay for spring entrance animation (seconds). */
  delay?: number;

  /** Disable the entrance animation entirely. */
  noAnimation?: boolean;
}

/** Framer Motion spring config for UI panel entrances. */
const springConfig = { stiffness: 300, damping: 24 };

export function GlassPanel({
  children,
  variant = 'default',
  interactive = false,
  delay = 0,
  noAnimation = false,
  className,
  ...motionProps
}: GlassPanelProps) {
  const variantClass = {
    default: glass.panel,
    strong: glass.panelStrong,
    pill: glass.pill,
  }[variant];

  return (
    <motion.div
      className={clsx(
        variantClass,
        interactive && glass.interactive,
        className,
      )}
      initial={noAnimation ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={noAnimation ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={noAnimation ? undefined : {
        type: 'spring',
        ...springConfig,
        delay,
      }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}
