'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isOrgAdmin } from '@/lib/profile-roles';
import { pageError } from '@/lib/toast';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  useCrmTableFeatures,
  useServerListSorting
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
import { Check, ChevronLeft, ChevronRight, Lock, X } from 'lucide-react';
import Link from 'next/link';
import { TableViewButton } from '@/components/buttons/table-view-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CrmTableBodySkeleton, CrmSkeletonBar } from '../_components/crm-skeletons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { approvalStatusTone, StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resolveSortFromState, sortRowsByState } from '@/lib/crm/list-sort';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { formatInrCompactLacCr } from '../inr-format';
import { embedOne, inquiryReference } from '../inquiry/inquiry-helpers';

const STATUS_FILTER_ALL = '__all__';

type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

type ApprovalRow = {
  id: string;
  sales_inquiry_id: string;
  project_id: string;
  unit_id: string | null;
  customer_id: string | null;
  list_price: number | null;
  offered_price: number;
  discount_pct: number | null;
  status: ApprovalStatus;
  request_note: string | null;
  decision_note: string | null;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  unit_code: string | null;
  project_name: string | null;
  requester_name: string | null;
};

type EmbedCustomer = { full_name: string | null; phone: string | null };
type EmbedUnit = { unit_code: string | null };
type EmbedProject = { name: string | null };
type ApprovalRecordFromDb = {
  id: string;
  sales_inquiry_id: string;
  project_id: string;
  unit_id: string | null;
  customer_id: string | null;
  list_price: number | null;
  offered_price: number;
  discount_pct: number | null;
  status: ApprovalStatus;
  request_note: string | null;
  decision_note: string | null;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  customers?: EmbedCustomer | EmbedCustomer[] | null;
  units?: EmbedUnit | EmbedUnit[] | null;
  projects?: EmbedProject | EmbedProject[] | null;
};

const globalApprovalFilter: FilterFn<ApprovalRow> = (row, _col, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  return [
    r.customer_name,
    r.customer_phone,
    r.unit_code,
    r.project_name,
    r.requester_name,
    inquiryReference(r.sales_inquiry_id),
    r.status
  ]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
};

const statusFilter: FilterFn<ApprovalRow> = (row, columnId, raw) => {
  const v = String(raw ?? '').trim();
  if (!v || v === STATUS_FILTER_ALL) return true;
  return String(row.getValue(columnId) ?? '') === v;
};

function fmtInr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatInrCompactLacCr(value);
}

function fmtDateTime(iso: string | null): string {
  return formatDisplayDateTime(iso);
}

export default function ApprovalsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: 'status', value: 'Pending' }
  ]);

  const [activeRow, setActiveRow] = useState<ApprovalRow | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const { sorting, onSortingChange } = useServerListSorting([
    { id: 'requested_at', desc: true }
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user?.id) {
        if (!cancelled) setIsSuperAdmin(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = String(
        (data as { role?: string } | null)?.role || ''
      ).trim();
      setIsSuperAdmin(isOrgAdmin(role));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const APPROVAL_DB_SORT: Record<string, string> = {
      status: 'status',
      pricing: 'offered_price',
      requested_at: 'requested_at'
    };
    const CLIENT_SORT = new Set(['customer', 'unitProject', 'reference', 'requester']);
    const first = sorting[0];
    const { column, ascending } = resolveSortFromState(
      sorting,
      APPROVAL_DB_SORT,
      'requested_at',
      false
    );

    let query = supabase
      .from('negotiation_approvals')
      .select(
        `
        id,
        sales_inquiry_id,
        project_id,
        unit_id,
        customer_id,
        list_price,
        offered_price,
        discount_pct,
        status,
        request_note,
        decision_note,
        requested_by,
        requested_at,
        decided_by,
        decided_at,
        customers ( full_name, phone ),
        units ( unit_code ),
        projects ( name )
      `
      )
      .limit(500);

    if (first && CLIENT_SORT.has(first.id)) {
      query = query.order('requested_at', { ascending: false });
    } else {
      query = query.order(column, { ascending });
    }

    const { data, error: readErr } = await query;
    if (readErr) {
      pageError(readErr.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const records = (data ?? []) as unknown as ApprovalRecordFromDb[];
    const requesterIds = [
      ...new Set(
        records
          .map((r) => r.requested_by)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const requesterNameById = new Map<string, string>();
    if (requesterIds.length > 0) {
      const { data: profileRows, error: profileErr } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', requesterIds);
      if (profileErr) {
        pageError(profileErr.message);
        setRows([]);
        setLoading(false);
        return;
      }
      for (const p of profileRows ?? []) {
        const id = String((p as { id?: string }).id ?? '').trim();
        if (!id) continue;
        const name = String((p as { name?: string | null }).name ?? '').trim();
        if (name) requesterNameById.set(id, name);
      }
    }
    let mapped: ApprovalRow[] = records.map((r) => {
      const customer = embedOne<EmbedCustomer>(r.customers);
      const unit = embedOne<EmbedUnit>(r.units);
      const project = embedOne<EmbedProject>(r.projects);
      return {
        id: r.id,
        sales_inquiry_id: r.sales_inquiry_id,
        project_id: r.project_id,
        unit_id: r.unit_id ?? null,
        customer_id: r.customer_id ?? null,
        list_price: r.list_price == null ? null : Number(r.list_price),
        offered_price: Number(r.offered_price),
        discount_pct: r.discount_pct == null ? null : Number(r.discount_pct),
        status: r.status,
        request_note: r.request_note ?? null,
        decision_note: r.decision_note ?? null,
        requested_by: r.requested_by ?? null,
        requested_at: r.requested_at,
        decided_by: r.decided_by ?? null,
        decided_at: r.decided_at ?? null,
        customer_name: customer?.full_name ?? null,
        customer_phone: customer?.phone ?? null,
        unit_code: unit?.unit_code ?? null,
        project_name: project?.name ?? null,
        requester_name: r.requested_by
          ? (requesterNameById.get(r.requested_by) ?? null)
          : null
      };
    });
    if (first && CLIENT_SORT.has(first.id)) {
      mapped = sortRowsByState(mapped, sorting, (row, colId) => {
        if (colId === 'customer') return row.customer_name ?? '';
        if (colId === 'unitProject') {
          return [row.unit_code, row.project_name].filter(Boolean).join(' · ');
        }
        if (colId === 'reference') return row.requested_at;
        if (colId === 'requester') return row.requester_name ?? '';
        return null;
      });
    }
    setRows(mapped);
    setLoading(false);
  }, [supabase, sorting]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const decide = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (!activeRow) return;
      setDeciding(true);
      try {
        const { error: rpcErr } = await supabase.rpc(
          'decide_negotiation_approval',
          {
            p_approval_id: activeRow.id,
            p_decision: decision,
            p_decision_note: decisionNote.trim() || null
          }
        );
        if (rpcErr) throw rpcErr;
        void fetch(
          `/api/crm/negotiation-approvals/${encodeURIComponent(activeRow.id)}/notify-decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              decisionNote: decisionNote.trim() || null
            })
          }
        );
        setActiveRow(null);
        setDecisionNote('');
        await loadRows();
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Decision failed');
      } finally {
        setDeciding(false);
      }
    },
    [activeRow, decisionNote, supabase, loadRows]
  );

  const columns = useMemo<ColumnDef<ApprovalRow, unknown>[]>(
    () => [
      {
        id: 'reference',
        header: 'Enquiry',
        accessorFn: (row) => inquiryReference(row.sales_inquiry_id),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/crm/inquiry/new?inquiry=${encodeURIComponent(
                row.original.sales_inquiry_id
              )}`}
              className="font-semibold text-ds-primary-700 hover:underline"
            >
              {inquiryReference(row.original.sales_inquiry_id)}
            </Link>
            <div className="text-[10px] tabular-nums text-muted-foreground">
              {fmtDateTime(row.original.requested_at)}
            </div>
          </div>
        )
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => row.customer_name ?? '',
        cell: ({ row }) => (
          <div className="min-w-[10rem] max-w-[14rem]">
            <div className="truncate font-medium text-foreground">
              {row.original.customer_name ?? '—'}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.customer_phone ?? '—'}
            </div>
          </div>
        )
      },
      {
        id: 'unitProject',
        header: 'Unit · Project',
        accessorFn: (row) =>
          [row.unit_code, row.project_name].filter(Boolean).join(' · '),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {row.original.unit_code ?? '—'}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {row.original.project_name ?? '—'}
            </div>
          </div>
        )
      },
      {
        id: 'pricing',
        header: 'List → Offer',
        accessorFn: (row) => row.offered_price,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground line-through">
                {fmtInr(r.list_price)}
              </div>
              <div className="text-sm font-bold text-ds-primary-700">
                {fmtInr(r.offered_price)}
              </div>
              {r.discount_pct != null ? (
                <div className="text-[10px] font-semibold text-amber-700">
                  −{r.discount_pct.toFixed(2)}%
                </div>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'requester',
        header: 'Requested by',
        accessorFn: (row) => row.requester_name ?? '',
        cell: ({ row }) => (
          <span className="block max-w-[10rem] truncate text-xs text-muted-foreground">
            {row.original.requester_name ?? '—'}
          </span>
        )
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        filterFn: statusFilter,
        cell: ({ getValue }) => {
          const status = getValue() as ApprovalStatus;
          return (
            <StatusChip tone={approvalStatusTone(status)} uppercase>
              {status}
            </StatusChip>
          );
        }
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => {
          const r = row.original;
          if (r.status !== 'Pending') {
            return (
              <span className="block max-w-[14rem] truncate text-right text-[11px] text-muted-foreground">
                {r.decision_note?.trim() || '—'}
              </span>
            );
          }
          return (
            <div className="flex justify-end">
              <TableViewButton
                label="Review"
                disabled={!isSuperAdmin}
                onClick={() => {
                  setActiveRow(r);
                  setDecisionNote(r.decision_note ?? '');
                }}
              />
            </div>
          );
        }
      }
    ],
    [isSuperAdmin]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter: globalFilterValue, columnFilters, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilterValue,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalApprovalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10, pageIndex: 0 }
    },
    ...tableFeatures
  });

  const statusCol = table.getColumn('status');
  const statusVal = statusCol?.getFilterValue();
  const statusFilterValue =
    statusVal === undefined || statusVal === null
      ? STATUS_FILTER_ALL
      : String(statusVal);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === 'Pending').length,
    [rows]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Approvals
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Discount approvals from the enquiry pipeline. Only Super
          Admins can approve or reject.
        </p>
      </div>

      {isSuperAdmin === false ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            You can view requests, but only Admins can approve or reject.
          </span>
        </div>
      ) : null}

      <Card className="border-slate-200/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Discount requests
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="tabular-nums text-foreground">
                {loading && rows.length === 0 ? (
                  <CrmSkeletonBar className="inline-block w-16" />
                ) : (
                  `${rows.length} loaded`
                )}
              </span>
              {pendingCount > 0 ? (
                <StatusChip tone="warning" uppercase className="ml-2">
                  {pendingCount} pending
                </StatusChip>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadRows()}
          >
            Refresh
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-[12rem] flex-1">
            <Label
              htmlFor="approval-search"
              className="text-xs text-muted-foreground"
            >
              Search
            </Label>
            <Input
              id="approval-search"
              className="mt-1"
              value={globalFilterValue}
              onChange={(e) => setGlobalFilterValue(e.target.value)}
              placeholder="Customer, phone, unit, project, requester…"
            />
          </div>
          <div className="min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={statusFilterValue}
              onValueChange={(v) =>
                statusCol?.setFilterValue(
                  v === STATUS_FILTER_ALL ? undefined : v
                )
              }
            >
              <SelectTrigger className="mt-1 w-full min-w-[10rem]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[8rem]">
            <Label className="text-xs text-muted-foreground">Page size</Label>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="mt-1 w-full">
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

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full min-w-[56rem] caption-bottom text-sm"
            style={{ width: table.getCenterTotalSize() }}
          >
            <thead className="border-b border-border bg-muted/40 [&_tr]:border-border">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <CrmDataTableHead
                      key={h.id}
                      header={h}
                      className="px-3 uppercase tracking-wide text-muted-foreground"
                    />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <CrmTableBodySkeleton colSpan={columns.length} />
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    No approvals match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/80 transition-colors hover:bg-muted/25"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <CrmDataTableCell
                        key={cell.id}
                        cell={cell}
                        className="px-3 py-2.5 align-top"
                      />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {table.getFilteredRowModel().rows.length} row
            {table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {Math.max(1, table.getPageCount())}
            </span>
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

      <Dialog
        open={activeRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveRow(null);
            setDecisionNote('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {activeRow ? (
            <>
              <DialogHeader>
                <DialogTitle>Review discount</DialogTitle>
                <DialogDescription className="text-xs">
                  Decide whether to approve or reject the offered discount.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2 text-sm">
                <KeyValue
                  label="Customer"
                  value={`${activeRow.customer_name ?? '—'}${activeRow.customer_phone ? ` · ${activeRow.customer_phone}` : ''}`}
                />
                <KeyValue
                  label="Unit · project"
                  value={[activeRow.unit_code, activeRow.project_name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                />
                <KeyValue
                  label="List price"
                  value={fmtInr(activeRow.list_price)}
                />
                <KeyValue
                  label="Offered price"
                  value={fmtInr(activeRow.offered_price)}
                  emphasised
                />
                {activeRow.discount_pct != null ? (
                  <KeyValue
                    label="Discount"
                    value={`−${activeRow.discount_pct.toFixed(2)}%`}
                  />
                ) : null}
                <KeyValue
                  label="Requested by"
                  value={`${activeRow.requester_name ?? '—'} · ${fmtDateTime(
                    activeRow.requested_at
                  )}`}
                />
                {activeRow.request_note ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Request note
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {activeRow.request_note}
                    </p>
                  </div>
                ) : null}
                <div>
                  <Label className="text-xs">Decision note (optional)</Label>
                  <Textarea
                    rows={3}
                    className="mt-1 text-xs"
                    placeholder="Reason or condition for this decision…"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    disabled={!isSuperAdmin || deciding}
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deciding}
                  onClick={() => {
                    setActiveRow(null);
                    setDecisionNote('');
                  }}
                >
                  Cancel
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                    disabled={!isSuperAdmin || deciding}
                    onClick={() => void decide('reject')}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                  <Button
                    type="button"
                    className="gap-1 bg-teal-600 hover:bg-teal-700"
                    disabled={!isSuperAdmin || deciding}
                    onClick={() => void decide('approve')}
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KeyValue({
  label,
  value,
  emphasised
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-right text-sm',
          emphasised ? 'font-bold text-ds-primary-700' : 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}
