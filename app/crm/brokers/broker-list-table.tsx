'use client';

import { useMemo } from 'react';
import { TableViewButton } from '@/components/buttons/table-view-button';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import { useCrmTableFeatures } from '@/components/data-table/crm-table-features';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type OnChangeFn,
  type SortingState
} from '@tanstack/react-table';
import { brokerStatusTone, StatusChip } from '@/components/ui/status-chip';
import { formatDisplayDate } from '@/lib/format-display-date';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

export type BrokerTableRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_no: string | null;
  status: string;
  created_at: string;
};

export function BrokerListTable({
  rows,
  loading,
  sorting,
  onSortingChange
}: {
  rows: BrokerTableRow[];
  loading: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const columns = useMemo<ColumnDef<BrokerTableRow, unknown>[]>(
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
        id: 'license_no',
        header: 'RERA / License',
        accessorKey: 'license_no',
        cell: ({ row }) => (
          <span className="text-ds-gray-600">
            {row.original.license_no ?? '—'}
          </span>
        )
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <StatusChip tone={brokerStatusTone(row.original.status)} size="md">
            {row.original.status}
          </StatusChip>
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
        header: 'Actions',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <TableViewButton href={`/crm/brokers/${row.original.id}`} />
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
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table
        className="w-full min-w-4xl caption-bottom text-sm"
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
          {loading && table.getRowModel().rows.length === 0 ? (
            <CrmTableBodySkeleton colSpan={columns.length} />
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-ds-gray-500"
              >
                No brokers found.
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
