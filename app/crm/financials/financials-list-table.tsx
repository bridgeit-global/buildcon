'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatInrCompactLacCr } from '../inr-format';

export type FinancialBookingRow = {
  id: string;
  project_id: string;
  unit_id: string;
  customer_id: string;
  created_at: string;
  status: string;
  unit_code: string;
  customer_name: string;
  total_demand: number;
  total_received: number;
  balance: number;
  overdue: number;
};

const globalFinancialFilter: FilterFn<FinancialBookingRow> = (
  row,
  _columnId,
  raw
) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const b = row.original;
  const hay = [
    b.unit_code,
    b.customer_name,
    b.status,
    b.id
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type Props = {
  rows: FinancialBookingRow[];
  projectNameById: Map<string, string>;
  loading?: boolean;
};

export function FinancialsListTable({
  rows,
  projectNameById,
  loading
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<FinancialBookingRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        cell: ({ row }) => (
          <span className="text-xs text-ds-gray-600">
            {projectNameById.get(row.original.project_id) ?? '—'}
          </span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorKey: 'unit_code',
        cell: ({ row }) => (
          <span className="font-medium text-ds-gray-900">
            {row.original.unit_code}
          </span>
        )
      },
      {
        id: 'buyer',
        header: 'Buyer',
        accessorKey: 'customer_name',
        cell: ({ row }) => (
          <span className="text-ds-gray-800">{row.original.customer_name}</span>
        )
      },
      {
        id: 'demand',
        header: 'Final price',
        accessorFn: (r) => r.total_demand,
        cell: ({ row }) => (
          <span className="tabular-nums text-ds-gray-800">
            {formatInrCompactLacCr(row.original.total_demand)}
          </span>
        )
      },
      {
        id: 'received',
        header: 'Received',
        accessorFn: (r) => r.total_received,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium text-ds-success-700">
            {formatInrCompactLacCr(row.original.total_received)}
          </span>
        )
      },
      {
        id: 'balance',
        header: 'Balance',
        accessorFn: (r) => r.balance,
        cell: ({ row }) => (
          <span
            className={cn(
              'tabular-nums font-medium',
              row.original.balance > 0
                ? 'text-ds-error-700'
                : 'text-ds-gray-500'
            )}
          >
            {formatInrCompactLacCr(row.original.balance)}
          </span>
        )
      },
      {
        id: 'overdue',
        header: 'Overdue',
        accessorFn: (r) => r.overdue,
        cell: ({ row }) =>
          row.original.overdue > 0 ? (
            <span className="tabular-nums font-semibold text-ds-error-700">
              {formatInrCompactLacCr(row.original.overdue)}
            </span>
          ) : (
            <span className="text-ds-gray-400">—</span>
          )
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/crm/financials/${row.original.id}`}>Manage</Link>
          </Button>
        )
      }
    ],
    [projectNameById]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalFinancialFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } }
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search unit, buyer, booking…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2 text-sm text-ds-gray-600">
          <span>
            {table.getFilteredRowModel().rows.length} booking
            {table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
          </span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-9 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 15, 25, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ds-gray-200 bg-white">
        <table className="min-w-[56rem] w-full caption-bottom text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-ds-gray-200 bg-ds-gray-50">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-ds-gray-500"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
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
                  Loading bookings…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-ds-gray-500"
                >
                  {globalFilter
                    ? 'No bookings match your search.'
                    : 'No bookings yet.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ds-gray-100 hover:bg-ds-primary-50/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ds-gray-500">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
