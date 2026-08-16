import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Retargeted onto the Blocks C1 state fills so the existing call sites pick
 * up the new language without being rewritten.
 *
 * New code should reach for `Chip` from `components/blocks` instead — it
 * speaks the domain (`live` / `settled` / `owed` / `inert`) rather than
 * shadcn's generic variant names.
 */
const badgeVariants = cva(
  'inline-flex items-center px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.05em]',
  {
    variants: {
      variant: {
        default: 'bg-live text-live-foreground',
        secondary: 'bg-field-raised text-muted-foreground',
        destructive: 'bg-owed text-owed-foreground',
        success: 'bg-settled text-settled-foreground',
        outline: 'bg-field-raised text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
