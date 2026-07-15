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
import { UnitStatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { formatInrCompactLacCr } from '../inr-format';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

export type FinancialBookingRow = {
  id: string;
  project_id: string;
  unit_id: string;
  customer_id: string;
  created_at: string;
  status: string;
  unit_code: string;
  unit_status?: string | null;
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

type Props = ServerSortedTableProps & {
  rows: FinancialBookingRow[];
  projectNameById: Map<string, string>;
  loading?: boolean;
};

export function FinancialsListTable({
  rows,
  projectNameById,
  loading,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<FinancialBookingRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => projectNameById.get(row.project_id) ?? '',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {projectNameById.get(row.original.project_id) ?? '—'}
          </span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorKey: 'unit_code',
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.unit_code}
          </span>
        )
      },
      {
        id: 'buyer',
        header: 'Buyer',
        accessorKey: 'customer_name',
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.customer_name}</span>
        )
      },
      {
        id: 'unit_status',
        header: 'Unit status',
        accessorFn: (r) => r.unit_status ?? '',
        cell: ({ row }) => {
          const code = String(row.original.unit_status ?? '').toUpperCase();
          if (!code) return <span className="text-muted-foreground">—</span>;
          return <UnitStatusChip status={code} size="md" />;
        }
      },
      {
        id: 'demand',
        header: 'Final price',
        accessorFn: (r) => r.total_demand,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
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
                : 'text-muted-foreground'
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
            <span className="text-muted-foreground">—</span>
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
          <TableViewButton
            href={`/crm/financials/${row.original.id}`}
            label="Manage"
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
    data: rows,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalFinancialFilter,
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
          placeholder="Search unit, buyer, booking…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full min-w-[56rem] caption-bottom text-sm text-foreground"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/60">
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
                  className="px-4 py-12 text-center text-muted-foreground"
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
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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
