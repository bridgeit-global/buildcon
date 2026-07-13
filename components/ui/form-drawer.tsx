'use client';

import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  side = 'right'
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  side?: 'right' | 'left';
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'flex w-full flex-col gap-0 p-0 sm:max-w-md',
          className
        )}
      >
        <SheetHeader className="border-b border-border px-4 py-4 text-left">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="crm-scrollbar flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-t border-border sm:flex-row sm:justify-end">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
