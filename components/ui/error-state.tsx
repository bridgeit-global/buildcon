'use client';

import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  action,
  className
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm',
        className
      )}
      role="alert"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-ds-error-50 text-ds-error-600 dark:bg-ds-error-600/15 dark:text-ds-error-200">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button
            type="button"
            onClick={onRetry}
            className="rounded-xl transition-colors duration-150"
          >
            {retryLabel}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
