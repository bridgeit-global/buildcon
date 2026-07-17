'use client';

import { useMemo } from 'react';
import { TableViewButton } from '@/components/buttons/table-view-button';
import {
  CrmDataTable,
  useCrmTableFeatures
} from '@/components/data-table';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type OnChangeFn,
  type SortingState
} from '@tanstack/react-table';
import { formatDisplayDate } from '@/lib/format-display-date';

export type CustomerTableRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export function CustomerListTable({
  rows,
  loading,
  sorting,
  onSortingChange
}: {
  rows: CustomerTableRow[];
  loading: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const columns = useMemo<ColumnDef<CustomerTableRow, unknown>[]>(
    () => [
      {
        id: 'full_name',
        header: 'Name',
        accessorKey: 'full_name',
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">
            {row.original.full_name}
          </span>
        )
      },
      {
        id: 'phone',
        header: 'Phone',
        accessorKey: 'phone',
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.phone ?? '—'}</span>
        )
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email ?? '—'}</span>
        )
      },
      {
        id: 'created_at',
        header: 'Added',
        accessorKey: 'created_at',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDisplayDate(row.original.created_at)}
          </span>
        )
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <TableViewButton href={`/crm/customers/${row.original.id}`} />
        )
      }
    ],
    []
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    ...tableFeatures
  });

  return (
    <CrmDataTable
      table={table}
      columnCount={columns.length}
      loading={loading}
      dataLength={rows.length}
      minTableWidth="min-w-160"
      emptyState={{
        title: 'No customers found',
        description: 'Customers will appear here once added.'
      }}
    />
  );
}
