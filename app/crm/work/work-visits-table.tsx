'use client';

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
import { formatDisplayDateTime } from '@/lib/format-display-date';

export type WorkVisitRow = {
  visitId: string;
  scheduledAt: string;
  status: string;
  outcome: string | null;
  inquiryId: string;
  customerName: string;
  projectName: string;
};

const globalVisitFilter: FilterFn<WorkVisitRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [r.customerName, r.projectName, r.status, r.outcome]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type Props = ServerSortedTableProps & {
  rows: WorkVisitRow[];
  loading?: boolean;
};

export function WorkVisitsTable({
  rows,
  loading,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<WorkVisitRow, unknown>[]>(
    () => [
      {
        id: 'scheduledAt',
        header: 'When',
        accessorKey: 'scheduledAt',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {formatDisplayDateTime(row.original.scheduledAt)}
          </span>
        )
      },
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
        id: 'customerName',
        header: 'Customer',
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <span className="text-xs font-medium">{row.original.customerName}</span>
        )
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.status}</span>
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
            href={`/crm/inquiry/new?inquiry=${encodeURIComponent(row.original.inquiryId)}`}
            label="Open pipeline"
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
    globalFilterFn: globalVisitFilter,
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
          id="work-visits-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search customer, project, status…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="visit"
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
        minTableWidth="min-w-[560px]"
        cellClassName="align-top"
        getCellClassName={(cell) =>
          cell.column.id === 'actions' ? 'whitespace-nowrap text-right align-top' : undefined
        }
        emptyState={{
          title: globalFilter ? 'No visits found' : 'No upcoming site visits',
          description: globalFilter
            ? 'No visits match your search.'
            : 'Scheduled site visits will appear here.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
