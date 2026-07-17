'use client';

import { useMemo, useState } from 'react';
import {
  CrmDataTable,
  CrmDataTablePageSize,
  CrmDataTablePagination,
  CrmDataTableRowCount,
  CrmDataTableSearch,
  useCrmTableFeatures,
  type ServerSortedTableProps
} from '@/components/data-table';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { TableViewButton } from '@/components/buttons/table-view-button';
import { UnitStatusChip } from '@/components/ui/status-chip';
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

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <CrmDataTableSearch
          id="financials-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search unit, buyer, booking…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="booking"
            filtered={globalFilter.trim().length > 0}
          />
          <CrmDataTablePageSize table={table} />
        </div>
      </div>

      <CrmDataTable
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={rows.length}
        cellClassName="align-top"
        emptyState={{
          title: globalFilter ? 'No bookings found' : 'No bookings yet',
          description: globalFilter
            ? 'No bookings match your search.'
            : 'Bookings will appear here once created.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
