'use client';

import { useMemo, useState } from 'react';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  CRM_TABLE_FEATURES,
  useCrmTableFeatures
} from '@/components/data-table/crm-table-features';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { TableViewButton } from '@/components/buttons/table-view-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type DocumentsBookingListRow = {
  id: string;
  workflow_stage: string;
  projects: { name: string } | { name: string }[] | null;
  customers:
  | { full_name: string }
  | { full_name: string }[]
  | null;
  units:
  | { unit_code: string }
  | { unit_code: string }[]
  | null;
};

function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function projectName(p: DocumentsBookingListRow['projects']) {
  const row = unwrapJoin(p);
  return row?.name ?? '—';
}

const globalDocumentsBookingFilter: FilterFn<DocumentsBookingListRow> = (
  row,
  _columnId,
  raw
) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const b = row.original;
  const u = unwrapJoin(b.units);
  const c = unwrapJoin(b.customers);
  const hay = [projectName(b.projects), u?.unit_code, c?.full_name, b.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type DocumentsBookingListTableProps = {
  rows: DocumentsBookingListRow[];
  loading: boolean;
  selectedBookingId: string;
};

export function DocumentsBookingListTable({
  rows,
  loading,
  selectedBookingId
}: DocumentsBookingListTableProps) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<DocumentsBookingListRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => projectName(row.projects),
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{projectName(row.original.projects)}</span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorFn: (row) => unwrapJoin(row.units)?.unit_code ?? '',
        cell: ({ row }) => {
          const u = unwrapJoin(row.original.units);
          return (
            <span className="font-semibold text-ds-gray-900">{u?.unit_code ?? '—'}</span>
          );
        }
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => unwrapJoin(row.customers)?.full_name ?? '',
        cell: ({ row }) => (
          <span className="text-ds-gray-700">
            {unwrapJoin(row.original.customers)?.full_name ?? '—'}
          </span>
        )
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <TableViewButton
            href={`/crm/documents/${encodeURIComponent(row.original.id)}`}
            label="Open"
          />
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
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalDocumentsBookingFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    ...CRM_TABLE_FEATURES
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1">
          <Label className="text-ds-gray-600">Search bookings</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-gray-400" />
            <Input
              className="pl-9"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Project, unit, customer…"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="sr-only sm:not-sr-only sm:text-ds-gray-600">Rows</Label>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="w-[100px]">
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

      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className="w-full min-w-[52rem] caption-bottom text-sm"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-ds-gray-100 bg-ds-gray-50/80">
                {hg.headers.map((h) => (
                  <CrmDataTableHead key={h.id} header={h} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-ds-gray-500">
                  Loading bookings…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-ds-gray-500">
                  {rows.length === 0
                    ? 'No confirmed bookings.'
                    : 'No rows match your search.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const id = row.original.id;
                const isSelected = id === selectedBookingId;
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className={cn(
                      'border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60',
                      isSelected && 'bg-ds-primary-50/70 hover:bg-ds-primary-50'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <CrmDataTableCell key={cell.id} cell={cell} className="align-top" />
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
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
