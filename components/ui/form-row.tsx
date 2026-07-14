'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FormRow({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', className)}>{children}</div>
  );
}

export function FormRowFull({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('md:col-span-2', className)}>{children}</div>;
}
