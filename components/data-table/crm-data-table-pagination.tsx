'use client';

import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrmDataTableRowCount } from './crm-data-table-row-count';
import { cn } from '@/lib/utils';

type CrmDataTablePaginationProps<TData> = {
  table: Table<TData>;
  rowCount?: number;
  noun?: string;
  filtered?: boolean;
  className?: string;
  showRowCount?: boolean;
};

export function CrmDataTablePagination<TData>({
  table,
  rowCount,
  noun,
  filtered = false,
  className,
  showRowCount = false
}: CrmDataTablePaginationProps<TData>) {
  const count = rowCount ?? table.getFilteredRowModel().rows.length;

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground',
        className
      )}
    >
      {showRowCount && noun ? (
        <CrmDataTableRowCount count={count} noun={noun} filtered={filtered} />
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
