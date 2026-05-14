'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { FUNNEL_STAGES } from './inquiry-pipeline-dialog';
import {
  embedOne,
  inquiryReference,
  unitDisplayName
} from './inquiry-helpers';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';

const globalInquiryFilter: FilterFn<InquiryRowDb> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const inq = row.original;
  const c = embedOne(inq.customers);
  const name = String(c?.full_name || '').toLowerCase();
  const phone = String(c?.phone || '').toLowerCase();
  const email = String(c?.email || '').toLowerCase();
  const unitId = String(inq?.unit_id || '').toLowerCase();
  const u = embedOne(inq.units);
  const unitCode = String(u?.unit_code || '').toLowerCase();
  const source = String(inq.lead_source || '').toLowerCase();
  const ref = inquiryReference(inq.id).toLowerCase();
  const stage = String(
    embedOne(inq.sales_opportunities)?.funnel_stage || ''
  ).toLowerCase();
  return (
    name.includes(q) ||
    phone.includes(q) ||
    email.includes(q) ||
    unitId.includes(q) ||
    unitCode.includes(q) ||
    source.includes(q) ||
    ref.includes(q) ||
    stage.includes(q)
  );
};

const equalsOrAll: FilterFn<InquiryRowDb> = (row, columnId, raw) => {
  const v = String(raw ?? '').trim();
  if (!v || v === '__all__') return true;
  return String(row.getValue(columnId) ?? '').trim() === v;
};

export type InquiryListTableProps = {
  inquiries: InquiryRowDb[];
  loadingInquiries: boolean;
  loadInquiries: () => void | Promise<void>;
  units: UnitLabelRow[];
  navigateToBookingFromInquiry: (inq: InquiryRowDb) => void;
};

export function InquiryListTable({
  inquiries,
  loadingInquiries,
  loadInquiries,
  units,
  navigateToBookingFromInquiry
}: InquiryListTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState('');

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) {
      if (!u?.id) continue;
      map.set(u.id, unitDisplayName(u));
    }
    return map;
  }, [units]);

  const stageOptions = useMemo(() => {
    const fromData = new Set<string>();
    for (const inq of inquiries) {
      const s = String(
        embedOne(inq.sales_opportunities)?.funnel_stage || ''
      ).trim();
      if (s) fromData.add(s);
    }
    const ordered: string[] = [...FUNNEL_STAGES].filter((s) => fromData.has(s));
    for (const s of fromData) {
      if (!ordered.includes(s)) {
        ordered.push(s);
      }
    }
    return ordered;
  }, [inquiries]);

  const leadSourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const inq of inquiries) {
      const src = String(inq.lead_source || '').trim() || 'Unknown';
      set.add(src);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [inquiries]);

  const columns = useMemo<ColumnDef<InquiryRowDb, unknown>[]>(
    () => [
      {
        id: 'ref',
        header: 'Reference',
        accessorFn: (row) => inquiryReference(row.id),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-semibold text-foreground">
              {inquiryReference(row.original.id)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {row.original.created_at
                ? new Date(row.original.created_at).toLocaleString()
                : '—'}
            </div>
          </div>
        ),
        enableGlobalFilter: true
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => embedOne(row.customers)?.full_name ?? '',
        cell: ({ row }) => {
          const c = embedOne(row.original.customers);
          return (
            <div className="min-w-[8rem] max-w-[14rem]">
              <div className="truncate font-medium text-foreground">
                {c?.full_name ?? '—'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {c?.phone ?? '—'}
              </div>
              {c?.email ? (
                <div className="truncate text-[11px] text-muted-foreground">
                  {c.email}
                </div>
              ) : null}
            </div>
          );
        },
        enableGlobalFilter: true
      },
      {
        id: 'funnelStage',
        header: 'Stage',
        accessorFn: (row) =>
          String(embedOne(row.sales_opportunities)?.funnel_stage || '').trim() ||
          '—',
        filterFn: equalsOrAll,
        cell: ({ getValue }) => {
          const label = String(getValue() || '—');
          return (
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                label === 'Enquiry' || !label || label === '—'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : label === 'Qualified'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : label === 'Site Visit'
                      ? 'border-green-200 bg-green-50 text-green-900'
                      : label === 'Lost'
                        ? 'border-slate-200 bg-slate-100 text-slate-700'
                        : label === 'Won' || label === 'Booking'
                          ? 'border-violet-200 bg-violet-50 text-violet-900'
                          : 'border-blue-200 bg-blue-50 text-blue-900'
              )}
            >
              {label}
            </span>
          );
        }
      },
      {
        id: 'leadSource',
        header: 'Source',
        accessorFn: (row) =>
          String(row.lead_source || '').trim() || 'Unknown',
        filterFn: equalsOrAll,
        cell: ({ row }) => {
          const src = row.original.lead_source ?? '—';
          const brokerName =
            String(row.original.lead_source || '').toLowerCase() === 'broker'
              ? embedOne(row.original.brokers)?.full_name
              : null;
          return (
            <div className="min-w-0 max-w-[10rem]">
              <div className="truncate text-sm">{src}</div>
              {brokerName ? (
                <div className="truncate text-[11px] text-muted-foreground">
                  {brokerName}
                </div>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'unit',
        header: 'Unit',
        accessorFn: (row) => {
          const u = embedOne(row.units);
          if (u) return unitDisplayName(u);
          return unitNameById.get(row.unit_id) || row.unit_id || '—';
        },
        cell: ({ getValue }) => (
          <span className="block max-w-[10rem] truncate text-sm font-medium">
            {String(getValue())}
          </span>
        )
      },
      {
        id: 'parking',
        header: 'Parking',
        accessorFn: (row) =>
          row.parking_required === 'Yes'
            ? `Yes × ${row.parking_count}`
            : 'No',
        cell: ({ row }) => {
          const inq = row.original;
          return (
            <div className="text-xs">
              <span className="font-medium">
                {inq.parking_required === 'Yes'
                  ? `Ask × ${inq.parking_count}`
                  : 'No'}
              </span>
              {inq.parking_slots_available != null &&
              inq.parking_slots_available > 0 ? (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  At save: {inq.parking_slots_available}
                  {inq.parking_rate_snapshot != null &&
                  inq.parking_rate_snapshot > 0
                    ? ` @ ₹${inq.parking_rate_snapshot.toLocaleString('en-IN')}`
                    : ''}
                </div>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'seller',
        header: 'Seller',
        accessorFn: (row) => embedOne(row.profiles)?.name ?? '—',
        cell: ({ getValue }) => (
          <span className="block max-w-[8rem] truncate text-sm">
            {String(getValue())}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const inq = row.original;
          return (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  router.push(
                    `/crm/inquiry/pipeline/${encodeURIComponent(inq.id)}`
                  )
                }
              >
                Pipeline
              </Button>
              {inq.unit_id?.trim() ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => navigateToBookingFromInquiry(inq)}
                >
                  Booking
                  <ArrowRight className="size-3.5 opacity-90" />
                </Button>
              ) : (
                <span className="self-center px-1 text-[10px] text-muted-foreground">
                  No unit
                </span>
              )}
            </div>
          );
        }
      }
    ],
    [navigateToBookingFromInquiry, router, unitNameById]
  );

  const table = useReactTable({
    data: inquiries,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalInquiryFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 15, pageIndex: 0 }
    }
  });

  const stageCol = table.getColumn('funnelStage');
  const sourceCol = table.getColumn('leadSource');
  const stageFilterVal = stageCol?.getFilterValue();
  const stageFilter =
    stageFilterVal === undefined || stageFilterVal === null
      ? ''
      : String(stageFilterVal);
  const sourceFilterVal = sourceCol?.getFilterValue();
  const sourceFilter =
    sourceFilterVal === undefined || sourceFilterVal === null
      ? ''
      : String(sourceFilterVal);

  return (
    <Card className="p-4" id="inquiry-list">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Inquiry list
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Table view with search, filters, and pagination.{' '}
            <span className="tabular-nums text-foreground">
              {loadingInquiries ? 'Loading…' : `${inquiries.length} loaded`}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => void loadInquiries()}
          disabled={loadingInquiries}
        >
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="inquiry-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="inquiry-search"
            className="mt-1"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Customer, phone, email, ref, unit, stage, source…"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">Stage</Label>
            <Select
              value={stageFilter || '__all__'}
              onValueChange={(v) =>
                stageCol?.setFilterValue(v === '__all__' ? undefined : v)
              }
            >
              <SelectTrigger className="mt-1 w-full min-w-[10rem]" size="sm">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All stages</SelectItem>
                {stageOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">Lead source</Label>
            <Select
              value={sourceFilter || '__all__'}
              onValueChange={(v) =>
                sourceCol?.setFilterValue(v === '__all__' ? undefined : v)
              }
            >
              <SelectTrigger className="mt-1 w-full min-w-[10rem]" size="sm">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sources</SelectItem>
                {leadSourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[8rem]">
            <Label className="text-xs text-muted-foreground">Rows per page</Label>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="mt-1 w-full" size="sm">
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[56rem] caption-bottom text-sm">
          <thead className="border-b border-border bg-muted/40 [&_tr]:border-border">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="h-10 px-3 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loadingInquiries && inquiries.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No enquiries match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/25"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-top">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
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
          {globalFilter.trim() || table.getState().columnFilters.length > 0
            ? ' (filtered)'
            : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {Math.max(1, table.getPageCount())}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
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
              size="sm"
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
    </Card>
  );
}
