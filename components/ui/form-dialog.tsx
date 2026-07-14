'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  trigger
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  trigger?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent
        className={cn(
          'flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,32rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg',
          className
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 text-left sm:px-6">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div
          className={cn(
            'crm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6',
            contentClassName
          )}
        >
          {children}
        </div>
        {footer ? (
          <DialogFooter className="shrink-0 border-t border-border px-4 py-4 sm:px-6 sm:py-4">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
