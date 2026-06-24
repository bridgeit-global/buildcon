'use client';

import { useMemo, useState } from 'react';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  useCrmTableFeatures,
  type ServerSortedTableProps
} from '@/components/data-table/crm-table-features';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr } from '../inr-format';

export type CollectionsListRow = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
  created_at: string | null;
};

const globalCollectionsFilter: FilterFn<CollectionsListRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const c = row.original;
  const milestone = String(row.getValue('milestone') ?? '').toLowerCase();
  return (
    String(c.mode || '').toLowerCase().includes(q) ||
    String(c.reference || '').toLowerCase().includes(q) ||
    String(formatDisplayDate(c.received_at)).toLowerCase().includes(q) ||
    milestone.includes(q) ||
    String(c.received_amount || '').toLowerCase().includes(q)
  );
};

type Props = ServerSortedTableProps & {
  rows: CollectionsListRow[];
  scheduleLabelById: Map<string, string>;
  loading?: boolean;
  busy?: boolean;
  onDelete: (row: CollectionsListRow) => void | Promise<void>;
  onGenerateReceipt: (row: CollectionsListRow) => void | Promise<void>;
};

export function CollectionsListTable({
  rows,
  scheduleLabelById,
  loading,
  busy,
  onDelete,
  onGenerateReceipt,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const data = useMemo(() => rows, [rows]);

  const columns = useMemo<ColumnDef<CollectionsListRow, unknown>[]>(
    () => [
      {
        id: 'amount',
        header: 'Received',
        accessorFn: (r) => r.received_amount,
        cell: ({ row }) => (
          <div className="min-w-36">
            <div className="font-semibold text-ds-gray-900 tabular-nums">
              ₹ {formatInr(Number(row.original.received_amount || 0), { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-ds-gray-500">
              {formatDisplayDate(row.original.received_at)}
            </div>
          </div>
        )
      },
      {
        id: 'milestone',
        header: 'Milestone',
        accessorFn: (r) => {
          if (!r.schedule_id) return 'Unassigned';
          return scheduleLabelById.get(r.schedule_id) ?? '—';
        },
        cell: ({ getValue }) => (
          <span className="block min-w-48 max-w-[18rem] truncate text-sm text-ds-gray-700">
            {String(getValue() || '—')}
          </span>
        ),
        enableGlobalFilter: true
      },
      {
        id: 'modeRef',
        header: 'Mode / Ref',
        accessorFn: (r) => `${r.mode ?? ''} ${r.reference ?? ''}`.trim(),
        cell: ({ row }) => (
          <div className="min-w-48 max-w-[18rem]">
            <div className="truncate text-sm font-medium text-ds-gray-900">
              {row.original.mode ?? '—'}
            </div>
            <div className="truncate text-[11px] text-ds-gray-500">
              {row.original.reference ?? '—'}
            </div>
          </div>
        ),
        enableGlobalFilter: true
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy || loading}
              onClick={() => void onGenerateReceipt(row.original)}
            >
              Save receipt
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-ds-error-700 hover:text-ds-error-800"
              disabled={busy || loading}
              onClick={() => void onDelete(row.original)}
              title="Delete this collection entry"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        )
      }
    ],
    [busy, loading, onDelete, onGenerateReceipt, scheduleLabelById]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalCollectionsFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10, pageIndex: 0 }
    },
    ...tableFeatures
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-56 flex-1">
          <Label htmlFor="collections-search" className="text-xs text-ds-gray-500">
            Search
          </Label>
          <Input
            id="collections-search"
            className="mt-1"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Milestone, mode, reference, date, amount…"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className="w-full min-w-4xl caption-bottom text-sm"
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
            {loading && rows.length === 0 ? (
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
                  No collections match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <CrmDataTableCell key={cell.id} cell={cell} className="align-top" />
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
        <span className="tabular-nums">
          {table.getFilteredRowModel().rows.length} row
          {table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
          {globalFilter.trim() ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
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
    </div>
  );
}

