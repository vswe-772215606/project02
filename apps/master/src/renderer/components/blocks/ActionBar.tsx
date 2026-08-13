import * as React from 'react';

import { cn } from '@/lib/utils';

type ActionBarProps = {
  /** Primary and secondary actions, separated by the usual 2px seam. */
  children: React.ReactNode;
  /**
   * Remove, cancel, write off. Rendered last with a 16px moat in front of it —
   * the one place in the system where a gap is bigger than a seam.
   */
  destructive?: React.ReactNode;
  /** `end` right-aligns the group, which is what dialogs and sheets want. */
  align?: 'start' | 'end';
  className?: string;
};

/**
 * The row of actions at the foot of a surface.
 *
 * Everything in Blocks sits 2px apart, which is exactly why a destructive
 * button cannot: 2px between "Tasdiqlash" and "O'chirish" is a misfire
 * waiting to happen on glass. Passing it as `destructive` guarantees the
 * 16px separation instead of leaving it to each call site to remember.
 */
export function ActionBar({ children, destructive, align = 'end', className }: ActionBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-seam',
        align === 'end' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {children}
      {destructive ? <div className="ml-moat">{destructive}</div> : null}
    </div>
  );
}
