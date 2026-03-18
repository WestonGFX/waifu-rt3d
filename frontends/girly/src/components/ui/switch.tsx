import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils.ts';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[color:var(--control-border)] bg-[color:var(--control-bg-soft)] shadow-[var(--control-shadow)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--control-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-anime-500',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-[color:var(--card-bg)] shadow-[var(--control-shadow)] ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
