'use client';

import { useState } from 'react';
import {
  getSortedRowModel,
  type ColumnSizingState,
  type SortingState
} from '@tanstack/react-table';

export const CRM_TABLE_DEFAULT_COLUMN = {
  minSize: 72,
  size: 160,
  maxSize: 560
} as const;

export const CRM_TABLE_FEATURES = {
  getSortedRowModel: getSortedRowModel(),
  enableColumnResizing: true,
  columnResizeMode: 'onChange' as const,
  defaultColumn: CRM_TABLE_DEFAULT_COLUMN
};

export function useCrmTableFeatures() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  return {
    sorting,
    onSortingChange: setSorting,
    columnSizing,
    onColumnSizingChange: setColumnSizing
  };
}
