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
        id: 'stage',
        header: 'Stage',
        accessorFn: (r) =>
          r.stageKey === 'site_visit' ? 'Visit site' : r.funnelStage,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
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
            <span className="text-xs text-muted-foreground">
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
          <span className="max-w-[280px] text-xs text-muted-foreground">
            {row.original.note?.trim() || '—'}
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
    globalFilterFn: globalFollowFilter,
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
          id="work-followups-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search customer, project, stage…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="follow-up"
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
        minTableWidth="min-w-[640px]"
        cellClassName="align-top"
        getRowClassName={(row) => {
          const r = row.original;
          const highlight = r.assignedToMe && r.needsAttention;
          return highlight
            ? 'border-l-4 border-l-ds-primary-500 bg-ds-primary-50/80'
            : '';
        }}
        getCellClassName={(cell) => {
          if (cell.column.id === 'dueAt') return 'whitespace-nowrap';
          if (cell.column.id === 'actions') return 'whitespace-nowrap text-right';
          return undefined;
        }}
        emptyState={{
          title: globalFilter ? 'No follow-ups found' : 'No open follow-ups',
          description: globalFilter
            ? 'No follow-ups match your search.'
            : 'Scheduled follow-ups will appear here.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
