'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type CrmDataTableLayoutProps = {
  children: ReactNode;
  asCard?: boolean;
  className?: string;
  header?: ReactNode;
  id?: string;
};

export function CrmDataTableLayout({
  children,
  asCard = true,
  className,
  header,
  id
}: CrmDataTableLayoutProps) {
  const content = (
    <>
      {header}
      {children}
    </>
  );

  if (!asCard) {
    return (
      <div id={id} className={className}>
        {content}
      </div>
    );
  }

  return (
    <Card
      id={id}
      className={cn('overflow-hidden rounded-xl border-border p-4 shadow-sm', className)}
    >
      {content}
    </Card>
  );
}
