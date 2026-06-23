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
import { TableViewButton } from '@/components/buttons/table-view-button';
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
import {
  BOOKING_WORKFLOW_LABEL,
  BOOKING_WORKFLOW_STAGES,
  type BookingListRow,
  type BookingWorkflowStage
} from './booking-types';

const globalBookingFilter: FilterFn<BookingListRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const b = row.original;
  const u = Array.isArray(b.units) ? b.units[0] : b.units;
  const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
  const hay = [
    u?.unit_code,
    u?.wing_name,
    c?.full_name,
    c?.phone,
    b.workflow_stage,
    b.status,
    b.payment_mode
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

type Props = ServerSortedTableProps & {
  rows: BookingListRow[];
  projectNameById: Map<string, string>;
  loading?: boolean;
};

const STAGE_TABS: Array<{
  id: 'token' | 'all' | BookingWorkflowStage;
  label: string;
}> = [
    { id: 'all', label: 'All stages' },
    { id: 'token', label: 'Token received' },
    ...BOOKING_WORKFLOW_STAGES.filter((s) => s !== 'token').map((s) => ({
      id: s,
      label: BOOKING_WORKFLOW_LABEL[s]
    }))
  ];

export function BookingListTable({
  rows,
  projectNameById,
  loading,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [stageTab, setStageTab] = useState<(typeof STAGE_TABS)[number]['id']>('token');

  const filteredRows = useMemo(() => {
    if (stageTab === 'all') return rows;
    if (stageTab === 'token') {
      return rows.filter(
        (b) => b.workflow_stage === 'token' && b.status !== 'cancelled'
      );
    }
    return rows.filter((b) => b.workflow_stage === stageTab);
  }, [rows, stageTab]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    counts.token = rows.filter(
      (b) => b.workflow_stage === 'token' && b.status !== 'cancelled'
    ).length;
    for (const s of BOOKING_WORKFLOW_STAGES) {
      counts[s] = rows.filter((b) => b.workflow_stage === s).length;
    }
    return counts;
  }, [rows]);

  const columns = useMemo<ColumnDef<BookingListRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => projectNameById.get(row.project_id) ?? '',
        cell: ({ row }) => (
          <span className="text-xs text-ds-gray-600">
            {projectNameById.get(row.original.project_id) ?? '—'}
          </span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorFn: (row) => unwrapJoin(row.units)?.unit_code ?? '',
        cell: ({ row }) => {
          const u = unwrapJoin(row.original.units);
          const href = `/crm/bookings/${row.original.id}`;
          return (
            <Link
              href={href}
              className="block min-h-[44px] min-w-0 rounded-md py-1.5 pl-0 pr-2 text-left outline-offset-2 hover:bg-ds-primary-50/50 focus-visible:ring-2 focus-visible:ring-ds-primary-500"
            >
              <span className="font-medium text-ds-gray-900 underline-offset-2 hover:underline">
                {u?.unit_code ?? '—'}
              </span>
              <span className="block text-xs text-ds-gray-500">
                {u ? `${u.wing_name} · F${u.floor}` : ''}
              </span>
            </Link>
          );
        }
      },
      {
        id: 'buyer',
        header: 'Buyer',
        accessorFn: (row) => unwrapJoin(row.customers)?.full_name ?? '',
        cell: ({ row }) => {
          const c = unwrapJoin(row.original.customers);
          const co = row.original.co_buyers ?? [];
          return (
            <div>
              <span className="font-medium text-ds-gray-900">{c?.full_name ?? '—'}</span>
              <span className="block text-xs text-ds-gray-500">{c?.phone ?? ''}</span>
              {co.length > 0 ? (
                <span className="mt-1 block text-xs text-ds-gray-500">
                  +{co.length} co-applicant{co.length > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'workflow',
        header: 'Stage',
        accessorKey: 'workflow_stage',
        cell: ({ row }) => {
          const ws = row.original.workflow_stage as BookingWorkflowStage;
          const label = BOOKING_WORKFLOW_LABEL[ws] ?? ws;
          const cancelled = row.original.status === 'cancelled';
          return (
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                cancelled
                  ? 'bg-ds-error-50 text-ds-error-700'
                  : ws === 'confirmation'
                    ? 'bg-ds-primary-50 text-ds-primary-700'
                    : 'bg-ds-gray-100 text-ds-gray-700'
              )}
            >
              {cancelled ? 'Cancelled' : label}
            </span>
          );
        }
      },
      {
        id: 'amount',
        header: 'Token / amount',
        accessorKey: 'booking_amount',
        cell: ({ row }) => {
          const amt = row.original.booking_amount;
          return (
            <span className="tabular-nums text-ds-gray-800">
              {amt != null ? `₹${Number(amt).toLocaleString('en-IN')}` : '—'}
            </span>
          );
        }
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <TableViewButton
            href={`/crm/bookings/${row.original.id}`}
            label="Open"
          />
        )
      }
    ],
    [projectNameById]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: globalBookingFilter,
    initialState: { pagination: { pageSize: 10 } },
    ...tableFeatures
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-ds-gray-200">
        {STAGE_TABS.map((t) => {
          const active = stageTab === t.id;
          const count = stageCounts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              className={cn(
                'px-3 py-2 text-xs font-medium',
                active
                  ? 'border-b-2 border-ds-primary-500 text-ds-primary-700'
                  : 'text-ds-gray-600 hover:text-ds-gray-900'
              )}
              onClick={() => setStageTab(t.id)}
            >
              {t.label}{' '}
              <span className="ml-1 rounded-full bg-ds-gray-100 px-1.5 py-0.5 text-[10px] text-ds-gray-600">
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search unit, buyer, stage…"
          className="max-w-sm"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <div className="flex items-center gap-2 text-xs text-ds-gray-500">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[72px]">
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
          <span>per page</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className="w-full min-w-[56rem] caption-bottom text-sm"
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
                  No bookings match your search.
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
