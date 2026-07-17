'use client';

import type { ReactNode } from 'react';
import type { Row, Table, Cell } from '@tanstack/react-table';
import { CrmDataTableCell } from './crm-data-table-cell';
import { CrmDataTableHead } from './crm-data-table-head';
import { CrmTableBodySkeleton } from '@/app/crm/_components/crm-skeletons';
import { cn } from '@/lib/utils';

export type CrmDataTableEmptyState = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type CrmDataTableProps<TData> = {
  table: Table<TData>;
  columnCount: number;
  loading?: boolean;
  dataLength?: number;
  emptyState?: CrmDataTableEmptyState | string;
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: Row<TData>) => string;
  cellClassName?: string;
  getCellClassName?: (cell: Cell<TData, unknown>) => string | undefined;
  minTableWidth?: string;
  stickyHeader?: boolean;
  className?: string;
};

function renderEmptyState(emptyState: CrmDataTableEmptyState | string) {
  if (typeof emptyState === 'string') {
    return (
      <div className="text-sm text-muted-foreground">{emptyState}</div>
    );
  }

  return (
    <>
      <div className="text-sm font-semibold text-foreground">{emptyState.title}</div>
      {emptyState.description ? (
        <p className="mt-1 text-sm text-muted-foreground">{emptyState.description}</p>
      ) : null}
      {emptyState.action ? <div className="mt-4">{emptyState.action}</div> : null}
    </>
  );
}

export function CrmDataTable<TData>({
  table,
  columnCount,
  loading = false,
  dataLength = 0,
  emptyState = 'No rows found.',
  onRowClick,
  getRowClassName,
  cellClassName,
  getCellClassName,
  minTableWidth = 'min-w-[56rem]',
  stickyHeader = false,
  className
}: CrmDataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const showSkeleton = loading && dataLength === 0;

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border', className)}>
      <table
        className={cn('w-full caption-bottom text-sm text-foreground', minTableWidth)}
        style={{ minWidth: table.getCenterTotalSize() }}
      >
        <thead
          className={cn(
            stickyHeader && 'sticky top-0 z-1 bg-muted/60'
          )}
        >
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-muted/60">
              {hg.headers.map((h) => (
                <CrmDataTableHead key={h.id} header={h} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {showSkeleton ? (
            <CrmTableBodySkeleton colSpan={columnCount} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-12 text-center">
                {renderEmptyState(emptyState)}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-border last:border-0 transition-colors hover:bg-muted/50',
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row)
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <CrmDataTableCell
                    key={cell.id}
                    cell={cell}
                    className={cn(cellClassName, getCellClassName?.(cell))}
                  />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
