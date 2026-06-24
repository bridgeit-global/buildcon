'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { CrmProjectListItem } from '../_components/types';
import { formatInr } from '../inr-format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { projectStatusTone, StatusChip } from '@/components/ui/status-chip';

const globalProjectFilter: FilterFn<CrmProjectListItem> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const p = row.original;
  const hay =
    `${p.name} ${p.location ?? ''} ${p.type} ${p.status} ${p.fy ?? ''} ${p.rera_no ?? ''}`.toLowerCase();
  return hay.includes(q);
};

type ProjectListTableProps = ServerSortedTableProps & {
  projects: CrmProjectListItem[];
  loading: boolean;
  canCreateProject: boolean;
  onManage: (project: CrmProjectListItem) => void;
};

export function ProjectListTable({
  projects,
  loading,
  canCreateProject,
  onManage,
  sorting,
  onSortingChange
}: ProjectListTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<CrmProjectListItem, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-[10rem]">
              <div className="font-semibold text-ds-gray-900">{p.name}</div>
              {p.location ? (
                <div className="mt-0.5 text-xs text-ds-gray-500">{p.location}</div>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'type',
        header: 'Type',
        accessorKey: 'type',
        cell: ({ getValue }) => (
          <span className="text-ds-gray-700">{String(getValue() ?? '—')}</span>
        )
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const status = String(getValue() ?? '—');
          return (
            <StatusChip tone={projectStatusTone(status)} size="md">
              {status}
            </StatusChip>
          );
        }
      },
      {
        id: 'fy',
        header: 'FY',
        accessorFn: (row) => row.fy ?? '—',
        cell: ({ getValue }) => (
          <span className="text-ds-gray-600">{String(getValue())}</span>
        )
      },
      {
        id: 'wings',
        header: 'Wings',
        accessorKey: 'wing_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-ds-gray-700">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'units',
        header: 'Units',
        accessorKey: 'unit_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-ds-gray-700">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'members',
        header: 'Members',
        accessorKey: 'member_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-ds-gray-700">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'baseRate',
        header: 'Base rate',
        accessorFn: (row) => row.base_rate,
        cell: ({ row }) => {
          const rate = row.original.base_rate;
          return (
            <span className="text-ds-gray-700">
              {rate != null
                ? `₹ ${formatInr(rate, { maximumFractionDigits: 0 })}/sq.ft`
                : '—'}
            </span>
          );
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => router.push(`/crm/inventory?projectId=${p.id}`)}
              >
                Inventory
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => router.push(`/crm/project/${p.id}/cld`)}
              >
                CLD
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onManage(p)}>
                Manage
              </Button>
            </div>
          );
        }
      }
    ],
    [onManage, router]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: projects,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalProjectFilter,
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
    <Card className="overflow-hidden rounded-xl border-ds-gray-200 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Label htmlFor="project-search" className="sr-only">
            Search projects
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-gray-400" />
          <Input
            id="project-search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search projects…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-ds-gray-500">
            {loading ? 'Loading…' : `${filteredCount} project${filteredCount !== 1 ? 's' : ''}`}
            {globalFilter.trim() ? ' (filtered)' : ''}
          </p>
          <div className="min-w-[7rem]">
            <Label className="text-xs text-ds-gray-500">Rows per page</Label>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="mt-1 h-9 w-full">
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
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className="w-full min-w-[56rem] caption-bottom text-sm"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-ds-gray-100 bg-ds-gray-50/80">
                {hg.headers.map((h) => (
                  <CrmDataTableHead key={h.id} header={h} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && projects.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-ds-gray-500"
                >
                  Loading projects…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="text-sm font-semibold text-ds-gray-900">No projects found</div>
                  <p className="mt-1 text-sm text-ds-gray-500">
                    {canCreateProject
                      ? 'Create a project to get started.'
                      : 'Ask an admin to add you to a project.'}
                  </p>
                  {canCreateProject ? (
                    <Button asChild className="mt-4">
                      <Link href="/crm/project/create">Create project</Link>
                    </Button>
                  ) : null}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ds-gray-500">
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
    </Card>
  );
}
