import * as React from 'react';
import { cn } from '@/lib/utils.ts';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-3 py-2 text-sm text-text-primary shadow-[var(--control-shadow)] outline-none transition-colors placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-anime-300 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
