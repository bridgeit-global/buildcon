'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function FormSection({
  title,
  description,
  children,
  className,
  contentClassName
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('gap-0 rounded-xl border-border py-0 shadow-sm', className)}>
      <CardHeader className="gap-1 border-b border-border px-4 py-4 sm:px-6">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-sm leading-snug">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className={cn('space-y-4 px-4 py-4 sm:px-6 sm:py-5', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
