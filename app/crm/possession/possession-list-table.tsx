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
import { ChevronLeft, ChevronRight, KeyRound, Search } from 'lucide-react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
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
import { possessionUnitStatusTone, StatusChip } from '@/components/ui/status-chip';
import {
  countChecklistDone,
  POSSESSION_WORKFLOW_LABELS,
  type PossessionChecklistItem,
  type PossessionWorkflowStage
} from '@/lib/possession/possession-trackers';
import {
  normalizeUnitStatusCode,
  statusLabelForUnit
} from '../inventory/unit-status';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

export type PossessionListRow = {
  caseId: string;
  unitId: string;
  unitCode: string;
  projectName: string;
  customerName: string;
  unitStatus: string;
  workflowStage: PossessionWorkflowStage;
  checklist: PossessionChecklistItem[];
  keysHandedOverAt: string | null;
  bookingId: string | null;
};

const globalPossessionFilter: FilterFn<PossessionListRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.projectName,
    r.unitCode,
    r.customerName,
    statusLabelForUnit(r.unitStatus),
    POSSESSION_WORKFLOW_LABELS[r.workflowStage]
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type PossessionListTableProps = ServerSortedTableProps & {
  rows: PossessionListRow[];
  loading: boolean;
  onManage: (row: PossessionListRow) => void;
};

export function PossessionListTable({
  rows,
  loading,
  onManage,
  sorting,
  onSortingChange
}: PossessionListTableProps) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'given'>('all');

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'ready') {
      return rows.filter((r) => normalizeUnitStatusCode(r.unitStatus) === 'PRE_POSSESSION');
    }
    return rows.filter((r) => normalizeUnitStatusCode(r.unitStatus) === 'POSSESSED');
  }, [rows, statusFilter]);

  const columns = useMemo<ColumnDef<PossessionListRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorKey: 'projectName',
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{row.original.projectName}</span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorKey: 'unitCode',
        cell: ({ row }) => (
          <span className="font-semibold text-ds-gray-900">{row.original.unitCode}</span>
        )
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{row.original.customerName}</span>
        )
      },
      {
        id: 'unitStatus',
        header: 'Unit status',
        accessorFn: (row) => statusLabelForUnit(row.unitStatus),
        cell: ({ row }) => (
          <StatusChip
            tone={possessionUnitStatusTone(row.original.unitStatus)}
            size="md"
          >
            {statusLabelForUnit(row.original.unitStatus)}
          </StatusChip>
        )
      },
      {
        id: 'progress',
        header: 'Trackers',
        enableSorting: false,
        cell: ({ row }) => {
          const { done, total } = countChecklistDone(row.original.checklist);
          return (
            <span className="text-ds-gray-700">
              {done}/{total} complete
            </span>
          );
        }
      },
      {
        id: 'workflow',
        header: 'Workflow',
        accessorFn: (row) => POSSESSION_WORKFLOW_LABELS[row.workflowStage],
        cell: ({ row }) => (
          <span className="text-ds-gray-600 text-xs">
            {POSSESSION_WORKFLOW_LABELS[row.original.workflowStage]}
          </span>
        )
      },
      {
        id: 'actions',
        header: 'Actions',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => (
          <TableRowActions
            actions={[
              {
                id: 'manage',
                label: 'Manage',
                icon: <KeyRound className="size-3.5" aria-hidden />,
                onClick: () => onManage(row.original)
              }
            ]}
          />
        )
      }
    ],
    [onManage]
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
    globalFilterFn: globalPossessionFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    ...tableFeatures
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Label htmlFor="possession-search" className="sr-only">
              Search
            </Label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-gray-400"
              aria-hidden
            />
            <Input
              id="possession-search"
              placeholder="Search unit, customer, project…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-44">
            <Label htmlFor="possession-status-filter" className="sr-only">
              Unit status filter
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as 'all' | 'ready' | 'given')
              }
            >
              <SelectTrigger id="possession-status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All handover units</SelectItem>
                <SelectItem value="ready">Possession ready only</SelectItem>
                <SelectItem value="given">Possession given only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-ds-gray-500">
          {table.getFilteredRowModel().rows.length} unit
          {table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
        </p>
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
            {loading && table.getRowModel().rows.length === 0 ? (
              <CrmTableBodySkeleton colSpan={columns.length} />
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-ds-gray-500"
                >
                  No units in possession-ready or possession-given status for your
                  projects. Mark a registered unit as &quot;Possession ready&quot; in
                  Inventory to start handover tracking.
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Page size">
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
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {Math.max(table.getPageCount(), 1)}
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
