'use client';

import { useMemo, useState } from 'react';
import {
  CrmDataTable,
  CrmDataTableLayout,
  CrmDataTablePageSize,
  CrmDataTablePagination,
  CrmDataTableRowCount,
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
  type ColumnFiltersState,
  type FilterFn
} from '@tanstack/react-table';
import { TableRowActions } from '@/components/buttons/table-row-actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { UnitStatusChip } from '@/components/ui/status-chip';
import {
  formatFloorLabel,
  isUnitAvailableForBooking,
  STATUS_LABEL,
  UNIT_STATUS_CODES
} from './inventory-utils';
import { formatUnitAgreementValueCompact } from '../inr-format';

export type UnitRow = {
  id: string;
  project_id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_no: number;
  unit_type: string | null;
  unit_category: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rera_area: number | null;
  terrace_sqft: number | null;
  deck_sqft: number | null;
  loading_sqft: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included: number | null;
  rate: number | null;
  status: string;
  blocked_reason: string | null;
  blocked_on: string | null;
};

const globalUnitFilter: FilterFn<UnitRow> = (row, _columnId, value) => {
  const q = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const u = row.original;
  return (
    u.unit_code.toLowerCase().includes(q) ||
    u.wing_name.toLowerCase().includes(q)
  );
};

const exactOrAll: FilterFn<UnitRow> = (row, columnId, value) => {
  if (!value || value === 'All') return true;
  const cellValue = row.getValue<string | null>(columnId) ?? '';
  return cellValue === value;
};

const filterLabelClass = 'text-xs text-muted-foreground';

type Props = ServerSortedTableProps & {
  units: UnitRow[];
  structureOptions: string[];
  typeOptions: string[];
  loading: boolean;
  onOpenDetail: (u: UnitRow) => void;
  onEdit: (u: UnitRow) => void;
  onRefresh: () => void;
};

export function InventoryListTable({
  units,
  structureOptions,
  typeOptions,
  loading,
  onOpenDetail,
  onEdit,
  onRefresh,
  sorting,
  onSortingChange
}: Props) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [wingFilter, setWingFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = [];
    if (wingFilter !== 'All') f.push({ id: 'wing_name', value: wingFilter });
    if (statusFilter !== 'All') f.push({ id: 'status', value: statusFilter });
    if (typeFilter !== 'All') f.push({ id: 'unit_type', value: typeFilter });
    return f;
  }, [wingFilter, statusFilter, typeFilter]);

  const columns = useMemo<ColumnDef<UnitRow, unknown>[]>(
    () => [
      {
        id: 'unit_code',
        header: 'Unit No.',
        accessorKey: 'unit_code',
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.unit_code}</span>
        )
      },
      {
        id: 'wing_name',
        header: 'Wing',
        accessorKey: 'wing_name',
        filterFn: exactOrAll,
        cell: ({ row }) => (
          <span className="max-w-[140px] truncate text-muted-foreground">
            {row.original.wing_name}
          </span>
        )
      },
      {
        id: 'floor',
        header: 'Floor',
        accessorKey: 'floor',
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatFloorLabel(row.original.floor, row.original.unit_type)}
          </span>
        )
      },
      {
        id: 'unit_type',
        header: 'Type',
        accessorFn: (row) => row.unit_type ?? '',
        filterFn: exactOrAll,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.unit_type ?? '—'}</span>
        )
      },
      {
        id: 'areas',
        header: 'Areas',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          const parts = [
            u.carpet_area != null && Number(u.carpet_area) > 0
              ? `C ${u.carpet_area}`
              : null,
            u.bua_area != null && Number(u.bua_area) > 0
              ? `B ${u.bua_area}`
              : null,
            u.rera_area != null && Number(u.rera_area) > 0
              ? `R ${u.rera_area}`
              : null
          ].filter(Boolean);
          return (
            <span className="leading-snug text-foreground">
              {parts.join(' · ') || (u.area ?? '—')}
            </span>
          );
        }
      },
      {
        id: 'rate',
        header: 'Rate',
        accessorKey: 'rate',
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="text-foreground">
            {(Number(row.original.rate) || 0).toLocaleString('en-IN')}
          </span>
        )
      },
      {
        id: 'list_price',
        header: 'List price',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-semibold text-ds-primary-600">
            {formatUnitAgreementValueCompact(row.original)}
          </span>
        )
      },
      {
        id: 'parking',
        header: 'Pk',
        accessorKey: 'parking_slots_included',
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const p = row.original.parking_slots_included;
          return (
            <span className="text-muted-foreground">
              {p != null && Number(p) > 0 ? String(p) : '—'}
            </span>
          );
        }
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        filterFn: exactOrAll,
        enableGlobalFilter: false,
        cell: ({ row }) => <UnitStatusChip status={row.original.status} />
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
                id: 'edit',
                label: 'Edit',
                hidden: !isUnitAvailableForBooking(row.original.status),
                onClick: () => onEdit(row.original)
              },
              {
                id: 'view',
                label: 'View',
                onClick: () => onOpenDetail(row.original)
              }
            ]}
          />
        )
      }
    ],
    [onEdit, onOpenDetail]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: units,
    columns,
    state: { globalFilter, columnFilters, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalUnitFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    ...tableFeatures
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const isFiltered =
    globalFilter.trim().length > 0 ||
    wingFilter !== 'All' ||
    statusFilter !== 'All' ||
    typeFilter !== 'All';

  return (
    <CrmDataTableLayout asCard={false}>
      <CrmDataTableToolbar>
        <CrmDataTableSearch
          id="inventory-unit-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Unit code or wing…"
          label="Search"
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <Label className={filterLabelClass}>Wing</Label>
            <SearchableSelect
              value={wingFilter === 'All' ? 'All structures' : wingFilter}
              onValueChange={(v) =>
                setWingFilter(v === 'All structures' ? 'All' : v)
              }
              options={['All structures', ...structureOptions]}
              placeholder="All structures"
              searchPlaceholder="Search wing…"
              className="mt-1 w-full min-w-[10rem]"
            />
          </div>

          <div className="min-w-[10rem]">
            <Label className={filterLabelClass}>Status</Label>
            <SearchableSelect
              value={
                statusFilter === 'All'
                  ? 'All Status'
                  : (STATUS_LABEL[statusFilter] ?? statusFilter)
              }
              onValueChange={(label) => {
                if (label === 'All Status') {
                  setStatusFilter('All');
                  return;
                }
                const code = UNIT_STATUS_CODES.find(
                  (k) => (STATUS_LABEL[k] ?? k) === label
                );
                setStatusFilter(code ?? 'All');
              }}
              options={[
                'All Status',
                ...UNIT_STATUS_CODES.map((k) => STATUS_LABEL[k] ?? k)
              ]}
              placeholder="All Status"
              searchPlaceholder="Search status…"
              className="mt-1 w-full min-w-[10rem]"
            />
          </div>

          <div className="min-w-[10rem]">
            <Label className={filterLabelClass}>Type</Label>
            <SearchableSelect
              value={typeFilter === 'All' ? 'All Types' : typeFilter}
              onValueChange={(v) =>
                setTypeFilter(v === 'All Types' ? 'All' : v)
              }
              options={['All Types', ...typeOptions]}
              placeholder="All Types"
              searchPlaceholder="Search type…"
              className="mt-1 w-full min-w-[10rem]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 lg:ml-auto">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="unit"
            filtered={isFiltered}
            loading={loading && units.length === 0}
          />
          <CrmDataTablePageSize table={table} />
          <Button variant="outline" size="sm" onClick={onRefresh}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </CrmDataTableToolbar>

      <CrmDataTable
        className="mt-4"
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={units.length}
        onRowClick={onOpenDetail}
        stickyHeader
        emptyState={{
          title: 'No units found',
          description: 'Try adjusting your search or filters.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </CrmDataTableLayout>
  );
}
