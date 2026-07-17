'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
import {
  CrmDataTable,
  CrmDataTableLayout,
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
import type { CrmProjectListItem } from '../_components/types';
import { formatInr } from '../inr-format';
import { Button } from '@/components/ui/button';
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
              <div className="font-semibold text-foreground">{p.name}</div>
              {p.location ? (
                <div className="mt-0.5 text-xs text-muted-foreground">{p.location}</div>
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
          <span className="text-foreground">{String(getValue() ?? '—')}</span>
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
          <span className="text-muted-foreground">{String(getValue())}</span>
        )
      },
      {
        id: 'wings',
        header: 'Wings',
        accessorKey: 'wing_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-foreground">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'units',
        header: 'Units',
        accessorKey: 'unit_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-foreground">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'members',
        header: 'Members',
        accessorKey: 'member_count',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-foreground">{String(getValue() ?? 0)}</span>
        )
      },
      {
        id: 'baseRate',
        header: 'Base rate',
        accessorFn: (row) => row.base_rate,
        cell: ({ row }) => {
          const rate = row.original.base_rate;
          return (
            <span className="text-foreground">
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
        size: 72,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <TableRowActions
              menuLabel={`Actions for ${p.name}`}
              actions={[
                {
                  id: 'inventory',
                  label: 'Inventory',
                  href: `/crm/inventory?projectId=${p.id}`
                },
                {
                  id: 'cld',
                  label: 'CLD',
                  href: `/crm/project/${p.id}/cld`
                },
                {
                  id: 'templates',
                  label: 'Templates',
                  href: `/crm/project/${p.id}/templates`
                },
                {
                  id: 'manage',
                  label: 'Manage',
                  onClick: () => onManage(p)
                }
              ]}
            />
          );
        }
      }
    ],
    [onManage]
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
  const isFiltered = globalFilter.trim().length > 0;

  return (
    <CrmDataTableLayout>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <CrmDataTableSearch
          id="project-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search projects…"
          showIcon
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="project"
            filtered={isFiltered}
            loading={loading && projects.length === 0}
          />
          <CrmDataTablePageSize table={table} />
        </div>
      </div>

      <CrmDataTable
        className="mt-4"
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={projects.length}
        cellClassName="align-top"
        emptyState={{
          title: 'No projects found',
          description: canCreateProject
            ? 'Create a project to get started.'
            : 'Ask an admin to add you to a project.',
          action: canCreateProject ? (
            <Button asChild>
              <Link href="/crm/project/create">Create project</Link>
            </Button>
          ) : undefined
        }}
      />

      <CrmDataTablePagination table={table} />
    </CrmDataTableLayout>
  );
}
