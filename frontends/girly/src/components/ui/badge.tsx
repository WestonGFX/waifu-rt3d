import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const badgeVariants = cva(
  'inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border border-[color:var(--control-border)] bg-[color:var(--control-bg-soft)] text-anime-700',
        secondary: 'border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] text-text-secondary',
        success: 'bg-green-50 text-green-700',
        warning: 'bg-amber-50 text-amber-700',
        destructive: 'bg-rose-pastel-50 text-rose-pastel-400',
        muted: 'bg-[color:var(--control-bg-soft)] text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
