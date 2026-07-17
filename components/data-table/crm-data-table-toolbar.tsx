'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CrmDataTableToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function CrmDataTableToolbar({ children, className }: CrmDataTableToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end',
        className
      )}
    >
      {children}
    </div>
  );
}
