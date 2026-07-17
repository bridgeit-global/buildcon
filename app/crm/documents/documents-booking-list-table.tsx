'use client';

import { useMemo, useState } from 'react';
import {
  CrmDataTable,
  CrmDataTablePageSize,
  CrmDataTablePagination,
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
import { statusLabelForUnit } from '../inventory/unit-status';

export type DocumentsBookingListRow = {
  id: string;
  workflow_stage: string;
  projects: { name: string } | { name: string }[] | null;
  customers:
  | { full_name: string }
  | { full_name: string }[]
  | null;
  units:
  | { unit_code: string; status?: string | null }
  | { unit_code: string; status?: string | null }[]
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
  const unitStatusLabel = u?.status ? statusLabelForUnit(u.status) : null;
  const hay = [
    projectName(b.projects),
    u?.unit_code,
    unitStatusLabel,
    u?.status,
    c?.full_name,
    b.id
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type DocumentsBookingListTableProps = ServerSortedTableProps & {
  rows: DocumentsBookingListRow[];
  loading: boolean;
  selectedBookingId: string;
};

export function DocumentsBookingListTable({
  rows,
  loading,
  selectedBookingId,
  sorting,
  onSortingChange
}: DocumentsBookingListTableProps) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<DocumentsBookingListRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => projectName(row.projects),
        cell: ({ row }) => (
          <span className="text-foreground">{projectName(row.original.projects)}</span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorFn: (row) => unwrapJoin(row.units)?.unit_code ?? '',
        cell: ({ row }) => {
          const u = unwrapJoin(row.original.units);
          return (
            <span className="font-semibold text-foreground">{u?.unit_code ?? '—'}</span>
          );
        }
      },
      {
        id: 'unit_status',
        header: 'Unit status',
        accessorFn: (row) => {
          const u = unwrapJoin(row.units);
          return u?.status ? statusLabelForUnit(u.status) ?? '' : '';
        },
        cell: ({ row }) => {
          const u = unwrapJoin(row.original.units);
          return u?.status ? <UnitStatusChip status={u.status} size="sm" /> : '—';
        }
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => unwrapJoin(row.customers)?.full_name ?? '',
        cell: ({ row }) => (
          <span className="text-foreground">
            {unwrapJoin(row.original.customers)?.full_name ?? '—'}
          </span>
        )
      },
      {
        id: 'action',
        header: 'Actions',
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
    globalFilterFn: globalDocumentsBookingFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    ...tableFeatures
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <CrmDataTableSearch
          id="documents-booking-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Project, unit, customer…"
          label="Search bookings"
          showIcon
        />
        <CrmDataTablePageSize table={table} />
      </div>

      <CrmDataTable
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={rows.length}
        minTableWidth="min-w-208"
        cellClassName="align-top"
        getRowClassName={(row) =>
          row.original.id === selectedBookingId
            ? 'bg-ds-primary-50/70 hover:bg-ds-primary-50'
            : ''
        }
        emptyState={{
          title: rows.length === 0 ? 'No confirmed bookings' : 'No bookings found',
          description:
            rows.length === 0
              ? 'Confirmed bookings will appear here.'
              : 'No rows match your search.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
