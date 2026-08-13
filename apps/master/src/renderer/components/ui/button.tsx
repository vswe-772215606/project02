import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Blocks C1 button.
 *
 * No radius, no border, no shadow, and no hover state — the terminal is a
 * touchscreen, so feedback is `:active` only: a fill shift plus a 1px nudge.
 * Every size clears the 48px touch floor; `sm` now means less padding, not a
 * shorter control.
 *
 * A destructive button must sit 16px clear of everything else. `ActionBar`
 * enforces that spacing structurally — prefer it over a hand-rolled row.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-[15px] font-semibold tracking-[0.01em]',
    'transition-[background-color,transform] duration-75 active:translate-y-px',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:bg-field-raised disabled:text-muted-foreground disabled:translate-y-0',
    '[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        /** The one action this screen exists for. */
        default: 'bg-live text-live-foreground',
        /** Removes, cancels, writes off. Keep it 16px clear — see ActionBar. */
        destructive: 'bg-owed text-owed-foreground',
        /** Everything else on the surface. */
        outline: 'bg-field text-foreground active:bg-field-press',
        secondary: 'bg-field-raised text-foreground active:bg-field-press',
        ghost: 'bg-transparent text-foreground active:bg-field-press',
        link: 'bg-transparent text-foreground underline underline-offset-4',
      },
      size: {
        default: 'h-control px-5',
        /** Primary confirm on a payment or approval surface. */
        action: 'h-action px-6',
        sm: 'h-control px-4',
        lg: 'h-action px-8',
        icon: 'h-control w-control px-0',
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
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
