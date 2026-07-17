'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TableViewButton } from '@/components/buttons/table-view-button';
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
import { formatDisplayDate } from '@/lib/format-display-date';
import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
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

type Props = ServerSortedTableProps & {
  rows: WorkOverdueRow[];
  loading?: boolean;
};

export function WorkOverdueTable({
  rows,
  loading,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<WorkOverdueRow, unknown>[]>(
    () => [
      {
        id: 'projectName',
        header: 'Project',
        accessorKey: 'projectName',
        cell: ({ row }) => (
          <span className="max-w-[120px] truncate text-xs text-muted-foreground">
            {row.original.projectName}
          </span>
        )
      },
      {
        id: 'booking_id',
        header: 'Booking',
        accessorKey: 'booking_id',
        cell: ({ row }) => (
          <Link
            href={`/crm/bookings/${row.original.booking_id}`}
            className="text-xs font-semibold text-ds-primary-600 hover:underline"
          >
            {formatBookingDisplayId(row.original.booking_id)}
          </Link>
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
          <span className="text-xs text-muted-foreground">
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
        header: 'Actions',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: () => (
          <TableViewButton
            href="/crm/financials"
            label="Record receipt"
            showIcon={false}
          />
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
    globalFilterFn: globalOverdueFilter,
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
          id="work-overdue-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search project, booking, milestone…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="line"
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
        minTableWidth="min-w-[720px]"
        cellClassName="align-top"
        getCellClassName={(cell) =>
          cell.column.id === 'actions' ? 'whitespace-nowrap text-right align-top' : undefined
        }
        emptyState={{
          title: globalFilter ? 'No lines found' : 'No overdue lines',
          description: globalFilter
            ? 'No lines match your search.'
            : 'All payment milestones are up to date.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
