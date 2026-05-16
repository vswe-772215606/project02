import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-4', className)}>{children}</div>;
}
