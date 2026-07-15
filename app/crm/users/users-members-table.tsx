'use client';

import { useMemo, useState } from 'react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import { useCrmTableFeatures } from '@/components/data-table/crm-table-features';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
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
import { brokerStatusTone, StatusChip } from '@/components/ui/status-chip';
import { PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE } from '@/lib/admin/project-member-pipeline-guard';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

export type UsersMemberRow = {
  projectId: string;
  userId: string;
  projectName: string;
  userName: string;
  role: string;
  status: string;
  canManage: boolean;
  removalBlocked: boolean;
};

const globalMemberFilter: FilterFn<UsersMemberRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const m = row.original;
  const hay =
    `${m.projectName} ${m.userName} ${m.role} ${m.status}`.toLowerCase();
  return hay.includes(q);
};

type UsersMembersTableProps = {
  rows: UsersMemberRow[];
  loading: boolean;
  onRoleChange: (row: UsersMemberRow, role: string) => void;
  onStatusChange: (row: UsersMemberRow, status: string) => void;
  onRemove: (row: UsersMemberRow) => void;
};

export function UsersMembersTable({
  rows,
  loading,
  onRoleChange,
  onStatusChange,
  onRemove
}: UsersMembersTableProps) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<UsersMemberRow, unknown>[]>(
    () => [
      {
        id: 'project',
        header: 'Project',
        accessorKey: 'projectName',
        cell: ({ row }) => (
          <span className="font-semibold text-ds-gray-900">
            {row.original.projectName}
          </span>
        )
      },
      {
        id: 'user',
        header: 'User',
        accessorKey: 'userName',
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{row.original.userName}</span>
        )
      },
      {
        id: 'role',
        header: 'Role',
        accessorKey: 'role',
        cell: ({ row }) => {
          const m = row.original;
          if (!m.canManage) {
            return <span className="text-ds-gray-700">{m.role}</span>;
          }
          return (
            <Select
              value={m.role}
              onValueChange={(v) => onRoleChange(m, v)}
            >
              <SelectTrigger size="sm" className="h-8 w-auto min-w-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Member', 'Manager'].map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => {
          const m = row.original;
          if (!m.canManage) {
            return (
              <StatusChip tone={brokerStatusTone(m.status)} size="md">
                {m.status}
              </StatusChip>
            );
          }
          return (
            <Select
              value={m.status}
              onValueChange={(v) => onStatusChange(m, v)}
            >
              <SelectTrigger size="sm" className="h-8 w-auto min-w-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Active', 'Inactive'].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          const m = row.original;
          if (!m.canManage) {
            return <span className="text-xs text-ds-gray-400">—</span>;
          }
          return (
            <TableRowActions
              menuLabel={`Actions for ${m.userName}`}
              actions={[
                {
                  id: 'remove',
                  label: 'Remove',
                  variant: 'destructive',
                  disabled: m.removalBlocked,
                  title: m.removalBlocked
                    ? PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE
                    : undefined,
                  onClick: () => onRemove(m)
                }
              ]}
            />
          );
        }
      }
    ],
    [onRoleChange, onStatusChange, onRemove]
  );

  const {
    sorting,
    onSortingChange,
    columnSizing,
    onColumnSizingChange,
    tableFeatures
  } = useCrmTableFeatures();

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalMemberFilter,
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
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Label htmlFor="users-member-search" className="sr-only">
            Search members
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-gray-400" />
          <Input
            id="users-member-search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search members…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-ds-gray-500">
            {filteredCount} member{filteredCount !== 1 ? 's' : ''}
            {globalFilter.trim() ? ' (filtered)' : ''}
          </div>
          <div className="min-w-28">
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
          className="w-full min-w-160 caption-bottom text-sm"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-ds-gray-100 bg-ds-gray-50/80"
              >
                {hg.headers.map((h) => (
                  <CrmDataTableHead key={h.id} header={h} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <CrmTableBodySkeleton colSpan={columns.length} />
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="text-sm font-semibold text-ds-gray-900">
                    No members found
                  </div>
                  <p className="mt-1 text-sm text-ds-gray-500">
                    {globalFilter.trim()
                      ? 'Try a different search.'
                      : 'Invite a user or add an existing profile to a project.'}
                  </p>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <CrmDataTableCell
                      key={cell.id}
                      cell={cell}
                      className="align-middle"
                    />
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
    </div>
  );
}
