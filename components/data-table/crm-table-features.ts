'use client';

import { useState } from 'react';
import {
  getSortedRowModel,
  type ColumnSizingState,
  type OnChangeFn,
  type SortingState
} from '@tanstack/react-table';
import {
  DEFAULT_LIST_SORTING,
} from '@/lib/crm/list-sort';

export type ServerSortedTableProps = {
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
};

export { DEFAULT_LIST_SORTING };

export const CRM_TABLE_DEFAULT_COLUMN = {
  minSize: 72,
  size: 160,
  maxSize: 560
} as const;

/** Client-side sort (default for tables that load all rows at once). */
export const CRM_TABLE_CLIENT_FEATURES = {
  getSortedRowModel: getSortedRowModel(),
  enableColumnResizing: true,
  columnResizeMode: 'onChange' as const,
  defaultColumn: CRM_TABLE_DEFAULT_COLUMN
} as const;

/** Server-side sort — parent refetches when sorting changes. */
export const CRM_TABLE_SERVER_SORT_FEATURES = {
  manualSorting: true,
  enableColumnResizing: true,
  columnResizeMode: 'onChange' as const,
  defaultColumn: CRM_TABLE_DEFAULT_COLUMN
} as const;

/** @deprecated Use CRM_TABLE_CLIENT_FEATURES or CRM_TABLE_SERVER_SORT_FEATURES */
export const CRM_TABLE_FEATURES = CRM_TABLE_CLIENT_FEATURES;

export function useCrmTableFeatures(opts?: { serverSorting?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  if (opts?.serverSorting) {
    return {
      columnSizing,
      onColumnSizingChange: setColumnSizing,
      tableFeatures: CRM_TABLE_SERVER_SORT_FEATURES
    };
  }

  return {
    sorting,
    onSortingChange: setSorting,
    columnSizing,
    onColumnSizingChange: setColumnSizing,
    tableFeatures: CRM_TABLE_CLIENT_FEATURES
  };
}

export function useServerListSorting(
  initial: SortingState = DEFAULT_LIST_SORTING
): ServerSortedTableProps & { sorting: SortingState; onSortingChange: OnChangeFn<SortingState> } {
  const [sorting, setSorting] = useState<SortingState>(initial);
  return { sorting, onSortingChange: setSorting };
}
