'use client';

import { useMemo } from 'react';
import { TableViewButton } from '@/components/buttons/table-view-button';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  CRM_TABLE_FEATURES,
  useCrmTableFeatures
} from '@/components/data-table/crm-table-features';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef
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
}: {
  rows: CustomerTableRow[];
  loading: boolean;
}) {
  const columns = useMemo<ColumnDef<CustomerTableRow, unknown>[]>(
    () => [
      {
        id: 'full_name',
        header: 'Name',
        accessorKey: 'full_name',
        cell: ({ row }) => (
          <span className="font-semibold text-ds-gray-900">
            {row.original.full_name}
          </span>
        )
      },
      {
        id: 'phone',
        header: 'Phone',
        accessorKey: 'phone',
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{row.original.phone ?? '—'}</span>
        )
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => (
          <span className="text-ds-gray-600">{row.original.email ?? '—'}</span>
        )
      },
      {
        id: 'created_at',
        header: 'Added',
        accessorKey: 'created_at',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-ds-gray-500">
            {formatDisplayDate(row.original.created_at)}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
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

  const { sorting, onSortingChange, columnSizing, onColumnSizingChange } =
    useCrmTableFeatures();

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    ...CRM_TABLE_FEATURES
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table
        className="w-full min-w-160 caption-bottom text-sm"
        style={{ width: table.getCenterTotalSize() }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr
              key={hg.id}
              className="border-b border-ds-gray-100 bg-ds-gray-50/80"
            >
              {hg.headers.map((h) => (
                <CrmDataTableHead key={h.id} header={h} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-ds-gray-500"
              >
                Loading…
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-ds-gray-500"
              >
                No customers found.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
              >
                {row.getVisibleCells().map((cell) => (
                  <CrmDataTableCell key={cell.id} cell={cell} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
