'use client';

import { useMemo, useState } from 'react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
import {
  CrmDataTable,
  CrmDataTablePageSize,
  CrmDataTablePagination,
  CrmDataTableSearch,
  CrmDataTableToolbar,
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
import { Trash2 } from 'lucide-react';
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
            <div className="font-semibold text-foreground tabular-nums">
              ₹ {formatInr(Number(row.original.received_amount || 0), { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-muted-foreground">
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
          <span className="block min-w-48 max-w-[18rem] truncate text-sm text-foreground">
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
            <div className="truncate text-sm font-medium text-foreground">
              {row.original.mode ?? '—'}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {row.original.reference ?? '—'}
            </div>
          </div>
        ),
        enableGlobalFilter: true
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <TableRowActions
            actions={[
              {
                id: 'save-receipt',
                label: 'Save receipt',
                disabled: busy || loading,
                onClick: () => void onGenerateReceipt(row.original)
              },
              {
                id: 'delete',
                label: 'Delete',
                icon: <Trash2 className="size-3.5" />,
                variant: 'destructive',
                disabled: busy || loading,
                title: 'Delete this collection entry',
                onClick: () => void onDelete(row.original)
              }
            ]}
          />
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

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex flex-col gap-3">
      <CrmDataTableToolbar>
        <CrmDataTableSearch
          id="collections-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Milestone, mode, reference, date, amount…"
          label="Search"
        />
        <CrmDataTablePageSize table={table} className="lg:ml-auto" />
      </CrmDataTableToolbar>

      <CrmDataTable
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={rows.length}
        minTableWidth="min-w-4xl"
        cellClassName="align-top"
        emptyState={{
          title: 'No collections found',
          description: 'No collections match the current filters.'
        }}
      />

      <CrmDataTablePagination
        table={table}
        rowCount={filteredCount}
        noun="row"
        filtered={globalFilter.trim().length > 0}
        showRowCount
      />
    </div>
  );
}

