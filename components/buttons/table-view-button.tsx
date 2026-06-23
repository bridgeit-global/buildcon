'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TableViewButtonBaseProps = {
  label?: string;
  className?: string;
  disabled?: boolean;
  busy?: boolean;
  showIcon?: boolean;
  /** Stop click from bubbling to a clickable table row. Default true. */
  stopPropagation?: boolean;
};

type TableViewButtonHrefProps = TableViewButtonBaseProps & {
  href: string;
  onClick?: never;
};

type TableViewButtonClickProps = TableViewButtonBaseProps & {
  href?: never;
  onClick: () => void;
};

export type TableViewButtonProps =
  | TableViewButtonHrefProps
  | TableViewButtonClickProps;

function stopRowClick(e: MouseEvent) {
  e.stopPropagation();
}

export function TableViewButton({
  href,
  onClick,
  label = 'View',
  className,
  disabled,
  busy,
  showIcon = true,
  stopPropagation = true
}: TableViewButtonProps) {
  const isDisabled = disabled || busy;

  const content = (
    <>
      {showIcon && !busy ? <Eye className="size-3.5" aria-hidden /> : null}
      {busy ? '…' : label}
    </>
  );

  const buttonClassName = cn('h-8 min-h-9', className);

  if (href) {
    if (isDisabled) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={buttonClassName}
          disabled
        >
          {content}
        </Button>
      );
    }

    return (
      <Button variant="outline" size="sm" className={buttonClassName} asChild>
        <Link href={href} onClick={stopPropagation ? stopRowClick : undefined}>
          {content}
        </Link>
      </Button>
    );
  }

  if (!onClick) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={buttonClassName}
      disabled={isDisabled}
      onClick={(e) => {
        if (stopPropagation) stopRowClick(e);
        onClick();
      }}
    >
      {content}
    </Button>
  );
}
