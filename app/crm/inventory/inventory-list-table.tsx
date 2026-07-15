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
  type ColumnFiltersState,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { UnitStatusChip } from '@/components/ui/status-chip';
import {
  formatFloorLabel,
  isUnitAvailableForBooking,
  statusLabelForUnit,
  STATUS_LABEL,
  UNIT_STATUS_CODES
} from './inventory-utils';
import { formatUnitAgreementValueCompact } from '../inr-format';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

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

const filterLabelClass = 'text-xs text-ds-gray-500';

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
          <span className="text-[11px] font-semibold text-ds-gray-800">
            {row.original.unit_code}
          </span>
        )
      },
      {
        id: 'wing_name',
        header: 'Wing',
        accessorKey: 'wing_name',
        filterFn: exactOrAll,
        cell: ({ row }) => (
          <span className="max-w-[140px] truncate text-[11px] text-ds-gray-500">
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
          <span className="text-[11px] text-ds-gray-500">
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
          <span className="text-[11px] text-ds-gray-500">
            {row.original.unit_type ?? '—'}
          </span>
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
            <span className="text-[10px] leading-snug text-ds-gray-700">
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
          <span className="text-[11px] text-ds-gray-800">
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
          <span className="text-[11px] font-semibold text-ds-primary-600">
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
            <span className="text-[11px] text-ds-gray-600">
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
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="inventory-unit-search" className={filterLabelClass}>
            Search
          </Label>
          <Input
            id="inventory-unit-search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Unit code or wing…"
            className="mt-1"
          />
        </div>

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

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <span className="text-xs text-ds-gray-500">{filteredCount} units</span>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className="w-full min-w-[56rem] caption-bottom border-collapse text-sm"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead className="sticky top-0 z-[1] bg-ds-gray-50/90">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-ds-gray-100">
                {hg.headers.map((h) => (
                  <CrmDataTableHead
                    key={h.id}
                    header={h}
                    className="px-3 py-2 text-[10px]"
                  />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && table.getRowModel().rows.length === 0 ? (
              <CrmTableBodySkeleton colSpan={columns.length} />
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                  onClick={() => onOpenDetail(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <CrmDataTableCell key={cell.id} cell={cell} className="px-3 py-2" />
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-xs text-ds-gray-500"
                >
                  No units match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-ds-gray-500">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 text-xs text-ds-gray-500">
            <span>
              {pageIndex * pageSize + 1}–
              {Math.min((pageIndex + 1) * pageSize, filteredCount)} of{' '}
              {filteredCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
