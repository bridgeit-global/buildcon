'use client';

import { flexRender, type Header } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type CrmDataTableHeadProps<TData> = {
  header: Header<TData, unknown>;
  className?: string;
};

export function CrmDataTableHead<TData>({ header, className }: CrmDataTableHeadProps<TData>) {
  if (header.isPlaceholder) {
    return (
      <th
        className={cn(
          'relative h-10 px-4 text-left align-middle text-xs font-semibold text-muted-foreground',
          className
        )}
        style={{ width: header.getSize() }}
      />
    );
  }

  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const canResize = header.column.getCanResize();

  return (
    <th
      className={cn(
        'relative h-10 px-4 text-left align-middle text-xs font-semibold text-muted-foreground',
        className
      )}
      style={{ width: header.getSize() }}
    >
      {canSort ? (
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md pr-2 outline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ds-primary-500"
          onClick={header.column.getToggleSortingHandler()}
        >
          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
          {sorted === 'asc' ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : sorted === 'desc' ? (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
          )}
        </button>
      ) : (
        flexRender(header.column.columnDef.header, header.getContext())
      )}
      {canResize ? (
        <div
          onDoubleClick={() => header.column.resetSize()}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          className={cn(
            'absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none',
            'hover:bg-ds-primary-300/60',
            header.column.getIsResizing() && 'bg-ds-primary-400'
          )}
          aria-hidden
        />
      ) : null}
    </th>
  );
}
