import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] outline-none focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--control-ring-offset)] enabled:active:scale-[var(--motion-scale-press)] disabled:pointer-events-none disabled:opacity-50 shadow-[var(--control-shadow)]',
  {
    variants: {
      variant: {
        default: 'app-button-default border text-text-primary',
        secondary: 'app-button-secondary border text-text-secondary',
        ghost: 'border border-transparent bg-[color:var(--control-bg-ghost)] text-text-secondary shadow-none hover:bg-[color:var(--control-bg-soft)] hover:shadow-[var(--control-shadow)]',
        destructive: 'border border-rose-pastel-200 bg-rose-pastel-50/88 text-rose-pastel-400 hover:bg-rose-pastel-100/95',
        muted: 'border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] text-text-muted hover:bg-[color:var(--control-bg)]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 py-1.5 text-xs',
        lg: 'h-10 px-5 py-2.5',
        icon: 'h-8 w-8 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
