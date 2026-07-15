'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type TableRowAction = {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  /** Visual style for inline buttons; menu items map destructive separately. */
  variant?: 'default' | 'outline' | 'destructive';
  hidden?: boolean;
  title?: string;
};

export type TableRowActionsProps = {
  actions: TableRowAction[];
  /** Max actions shown as inline buttons before collapsing to a menu. Default 2. */
  maxInline?: number;
  align?: 'start' | 'end';
  className?: string;
  /** Stop click from bubbling to a clickable table row. Default true. */
  stopPropagation?: boolean;
  menuLabel?: string;
};

function stopRowClick(e: MouseEvent) {
  e.stopPropagation();
}

function visibleActions(actions: TableRowAction[]) {
  return actions.filter((a) => !a.hidden);
}

function InlineActionButton({
  action,
  stopPropagation
}: {
  action: TableRowAction;
  stopPropagation: boolean;
}) {
  const isDisabled = action.disabled || action.busy;
  const buttonVariant =
    action.variant === 'destructive'
      ? 'outline'
      : action.variant === 'default'
        ? 'default'
        : 'outline';

  const content = (
    <>
      {action.busy ? null : action.icon}
      {action.busy ? '…' : action.label}
    </>
  );

  const buttonClassName = cn(
    'h-8 min-h-9 gap-1',
    action.variant === 'destructive' &&
      'text-ds-error-700 hover:text-ds-error-800'
  );

  if (action.href) {
    if (isDisabled) {
      return (
        <Button
          type="button"
          variant={buttonVariant}
          size="sm"
          className={buttonClassName}
          disabled
          title={action.title}
        >
          {content}
        </Button>
      );
    }

    return (
      <Button variant={buttonVariant} size="sm" className={buttonClassName} asChild>
        <Link
          href={action.href}
          title={action.title}
          onClick={stopPropagation ? stopRowClick : undefined}
        >
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={buttonVariant}
      size="sm"
      className={buttonClassName}
      disabled={isDisabled}
      title={action.title}
      onClick={(e) => {
        if (stopPropagation) stopRowClick(e);
        action.onClick?.();
      }}
    >
      {content}
    </Button>
  );
}

export function TableRowActions({
  actions,
  maxInline = 2,
  align = 'end',
  className,
  stopPropagation = true,
  menuLabel = 'Open actions'
}: TableRowActionsProps) {
  const items = visibleActions(actions);
  if (items.length === 0) return null;

  if (items.length <= maxInline) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5',
          align === 'end' && 'justify-end',
          className
        )}
        onClick={stopPropagation ? stopRowClick : undefined}
      >
        {items.map((action) => (
          <InlineActionButton
            key={action.id}
            action={action}
            stopPropagation={stopPropagation}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center',
        align === 'end' && 'justify-end',
        className
      )}
      onClick={stopPropagation ? stopRowClick : undefined}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-h-9 w-9 px-0"
            aria-label={menuLabel}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align === 'end' ? 'end' : 'start'} className="min-w-40">
          {items.map((action) => {
            const isDisabled = action.disabled || action.busy;
            const label = action.busy ? `${action.label}…` : action.label;

            if (action.href && !isDisabled) {
              return (
                <DropdownMenuItem key={action.id} asChild>
                  <Link href={action.href} className="gap-2">
                    {action.icon}
                    {label}
                  </Link>
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuItem
                key={action.id}
                disabled={isDisabled}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                title={action.title}
                onSelect={() => {
                  if (isDisabled) return;
                  action.onClick?.();
                }}
              >
                {action.icon}
                {label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
