import * as React from 'react';
import { cn } from '@/lib/utils.ts';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[96px] w-full rounded-[20px] border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-4 py-3 text-sm leading-6 text-text-primary shadow-[var(--control-shadow)] outline-none transition-colors placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--control-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
