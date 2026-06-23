'use client';

import Link from 'next/link';
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
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { followUpDueState } from '@/lib/inquiry/follow-up-due';
import { cn } from '@/lib/utils';

export type WorkFollowRow = {
  followId: string;
  dueAt: string;
  note: string | null;
  inquiryId: string;
  customerName: string;
  funnelStage: string;
  projectName: string;
  stageKey: string;
  assignedTo: string | null;
  assignedToMe: boolean;
  needsAttention: boolean;
};

const globalFollowFilter: FilterFn<WorkFollowRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.customerName,
    r.projectName,
    r.funnelStage,
    r.stageKey === 'site_visit' ? 'visit site' : r.funnelStage,
    r.note,
    r.assignedToMe ? 'you' : r.assignedTo ? 'assigned' : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type Props = ServerSortedTableProps & {
  rows: WorkFollowRow[];
  loading?: boolean;
};

export function WorkFollowupsTable({
  rows,
  loading,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<WorkFollowRow, unknown>[]>(
    () => [
      {
        id: 'dueAt',
        header: 'Due',
        accessorKey: 'dueAt',
        cell: ({ row }) => {
          const r = row.original;
          const dueState = followUpDueState(r.dueAt);
          const highlight = r.assignedToMe && r.needsAttention;
          return (
            <span
              className={cn(
                'text-xs',
                highlight && 'font-semibold text-ds-primary-800',
                dueState === 'overdue' && 'text-ds-error-700'
              )}
            >
              {formatDisplayDateTime(r.dueAt)}
              {highlight ? (
                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ds-primary-700">
                  Your follow-up
                </span>
              ) : null}
            </span>
          );
        }
      },
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
        id: 'customerName',
        header: 'Customer',
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <span className="text-xs font-medium">{row.original.customerName}</span>
        )
      },
      {
        id: 'stage',
        header: 'Stage',
        accessorFn: (r) =>
          r.stageKey === 'site_visit' ? 'Visit site' : r.funnelStage,
        cell: ({ row }) => (
          <span className="text-xs text-ds-gray-600">
            {row.original.stageKey === 'site_visit'
              ? 'Visit site'
              : row.original.funnelStage}
          </span>
        )
      },
      {
        id: 'assignee',
        header: 'Assignee',
        accessorFn: (row) =>
          row.assignedToMe ? 'You' : row.assignedTo ? 'Assigned' : '',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="text-xs text-ds-gray-600">
              {r.assignedToMe ? (
                <span className="font-semibold text-ds-primary-700">You</span>
              ) : r.assignedTo ? (
                'Assigned'
              ) : (
                '—'
              )}
            </span>
          );
        }
      },
      {
        id: 'note',
        header: 'Note',
        accessorKey: 'note',
        cell: ({ row }) => (
          <span className="max-w-[280px] text-xs text-ds-gray-600">
            {row.original.note?.trim() || '—'}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <Link
            href={`/crm/inquiry/new?inquiry=${encodeURIComponent(row.original.inquiryId)}`}
            className="text-xs font-semibold text-ds-primary-600 underline"
          >
            Open pipeline
          </Link>
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
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalFollowFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    ...tableFeatures
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search customer, project, stage…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2 text-xs text-ds-gray-500">
          <span>
            {table.getFilteredRowModel().rows.length} follow-up
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
        <table
          className="w-full min-w-[640px] caption-bottom text-sm"
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
                  {globalFilter
                    ? 'No follow-ups match your search.'
                    : 'No open follow-ups.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original;
                const highlight = r.assignedToMe && r.needsAttention;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60',
                      highlight &&
                        'border-l-4 border-l-ds-primary-500 bg-ds-primary-50/80'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <CrmDataTableCell
                        key={cell.id}
                        cell={cell}
                        className={cn(
                          'align-top',
                          cell.column.id === 'dueAt' && 'whitespace-nowrap',
                          cell.column.id === 'actions' &&
                            'whitespace-nowrap text-right'
                        )}
                      />
                    ))}
                  </tr>
                );
              })
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
