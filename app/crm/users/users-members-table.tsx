'use client';

import { useMemo, useState } from 'react';
import { TableRowActions } from '@/components/buttons/table-row-actions';
import {
  CrmDataTable,
  CrmDataTableLayout,
  CrmDataTablePageSize,
  CrmDataTablePagination,
  CrmDataTableRowCount,
  CrmDataTableSearch,
  useCrmTableFeatures
} from '@/components/data-table';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { brokerStatusTone, StatusChip } from '@/components/ui/status-chip';
import { PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE } from '@/lib/admin/project-member-pipeline-guard';

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
          <span className="font-semibold text-foreground">
            {row.original.projectName}
          </span>
        )
      },
      {
        id: 'user',
        header: 'User',
        accessorKey: 'userName',
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.userName}</span>
        )
      },
      {
        id: 'role',
        header: 'Role',
        accessorKey: 'role',
        cell: ({ row }) => {
          const m = row.original;
          if (!m.canManage) {
            return <span className="text-foreground">{m.role}</span>;
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
            return <span className="text-xs text-muted-foreground">—</span>;
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
    <CrmDataTableLayout asCard={false}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <CrmDataTableSearch
          id="users-member-search"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search members…"
          showIcon
        />
        <div className="flex flex-wrap items-center gap-3">
          <CrmDataTableRowCount
            count={filteredCount}
            noun="member"
            filtered={globalFilter.trim().length > 0}
          />
          <CrmDataTablePageSize table={table} />
        </div>
      </div>

      <CrmDataTable
        className="mt-4"
        table={table}
        columnCount={columns.length}
        loading={loading}
        dataLength={rows.length}
        minTableWidth="min-w-160"
        cellClassName="align-middle text-foreground"
        emptyState={{
          title: 'No members found',
          description: globalFilter.trim()
            ? 'Try a different search.'
            : 'Invite a user or add an existing profile to a project.'
        }}
      />

      <CrmDataTablePagination table={table} />
    </CrmDataTableLayout>
  );
}
