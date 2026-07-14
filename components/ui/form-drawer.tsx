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

const drawerSizeClass = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl'
} as const;

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  side = 'right',
  size = 'md'
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  side?: 'right' | 'left';
  size?: keyof typeof drawerSizeClass;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'flex w-full flex-col gap-0 p-0',
          drawerSizeClass[size],
          className
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 text-left sm:px-6">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div
          className={cn(
            'crm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6',
            contentClassName
          )}
        >
          {children}
        </div>
        {footer ? (
          <SheetFooter className="shrink-0 border-t border-border px-4 py-4 sm:px-6 sm:flex-row sm:justify-end">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
