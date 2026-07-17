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
import { KeyRound } from 'lucide-react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
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
          <span className="text-foreground">{row.original.projectName}</span>
        )
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorKey: 'unitCode',
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.unitCode}</span>
        )
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.customerName}</span>
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
            <span className="text-foreground">
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
          <span className="text-xs text-muted-foreground">
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

  const filteredCount = table.getFilteredRowModel().rows.length;
  const isFiltered = globalFilter.trim().length > 0 || statusFilter !== 'all';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <CrmDataTableSearch
            id="possession-search"
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Search unit, customer, project…"
            showIcon
          />
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
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="unit"
            filtered={isFiltered}
            loading={loading && rows.length === 0}
          />
          <CrmDataTablePageSize table={table} />
        </div>
      </div>

      <CrmDataTable
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={filteredRows.length}
        cellClassName="align-top"
        emptyState={{
          title: 'No possession units found',
          description:
            'No units in possession-ready or possession-given status for your projects. Mark a registered unit as "Possession ready" in Inventory to start handover tracking.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </div>
  );
}
