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
import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr } from '../inr-format';

export type WorkOverdueRow = {
  booking_id: string;
  schedule_id: string;
  instalment_no: number | null;
  milestone: string;
  due_date: string | null;
  demand_amount: number;
  outstanding_amount: number;
  customer_id: string;
  project_id: string;
  projectName: string;
};

const globalOverdueFilter: FilterFn<WorkOverdueRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.projectName,
    r.booking_id,
    r.milestone,
    r.instalment_no != null ? String(r.instalment_no) : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type Props = {
  rows: WorkOverdueRow[];
  loading?: boolean;
};

export function WorkOverdueTable({ rows, loading }: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<WorkOverdueRow, unknown>[]>(
    () => [
      {
        id: 'projectName',
        header: 'Project',
        accessorKey: 'projectName',
        cell: ({ row }) => (
          <span className="max-w-[120px] truncate text-xs text-ds-gray-600">
            {row.original.projectName}
          </span>
        )
      },
      {
        id: 'booking_id',
        header: 'Booking',
        accessorKey: 'booking_id',
        cell: ({ row }) => (
          <span className="font-mono text-[10px] text-ds-gray-600">
            {row.original.booking_id}
          </span>
        )
      },
      {
        id: 'instalment_no',
        header: '#',
        accessorKey: 'instalment_no',
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.instalment_no != null
              ? row.original.instalment_no
              : '—'}
          </span>
        )
      },
      {
        id: 'milestone',
        header: 'Milestone',
        accessorKey: 'milestone',
        cell: ({ row }) => (
          <span className="text-xs">{row.original.milestone}</span>
        )
      },
      {
        id: 'due_date',
        header: 'Due',
        accessorKey: 'due_date',
        cell: ({ row }) => (
          <span className="text-xs text-ds-gray-600">
            {formatDisplayDate(row.original.due_date)}
          </span>
        )
      },
      {
        id: 'outstanding_amount',
        header: 'Outstanding',
        accessorKey: 'outstanding_amount',
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-ds-error-700">
            ₹{' '}
            {formatInr(Number(row.original.outstanding_amount), {
              maximumFractionDigits: 0
            })}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: () => (
          <Link
            href="/crm/financials"
            className="text-xs font-semibold text-ds-primary-600 underline"
          >
            Record receipt
          </Link>
        )
      }
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalOverdueFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } }
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search project, booking, milestone…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2 text-xs text-ds-gray-500">
          <span>
            {table.getFilteredRowModel().rows.length} line
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] caption-bottom text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-ds-gray-100 bg-ds-gray-50/80"
              >
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500"
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
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-ds-gray-500"
                >
                  {globalFilter
                    ? 'No lines match your search.'
                    : 'No overdue lines.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={
                        cell.column.id === 'actions'
                          ? 'whitespace-nowrap px-4 py-3 text-right align-top'
                          : 'px-4 py-3 align-top'
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
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
