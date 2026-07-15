'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TableRowActions } from '@/components/buttons/table-row-actions';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { funnelStageTone, StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import {
  INQUIRY_CLOSED_FUNNEL_STAGE,
  INQUIRY_LIST_FUNNEL_STAGES
} from './inquiry-funnel-stages';
import {
  STAGE_FILTER_NEW_LEADS,
  STAGE_FILTER_TOKEN
} from './inquiry-list-filters';
import { getInquiryClosedStatus, isInquiryClosed } from './inquiry-stage-transitions';
import {
  embedOne,
  inquiryReference,
  inquiryProjectLabel,
  inquiryUnitLabelFromRow,
  normalizeLeadSource,
  unitDisplayName
} from './inquiry-helpers';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';
import {
  CrmSkeletonBar,
  CrmTableBodySkeleton
} from '../_components/crm-skeletons';

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
  const source = normalizeLeadSource(String(inq.lead_source || '')).toLowerCase();
  const ref = inquiryReference(inq.id).toLowerCase();
  const stage = String(
    inq.funnel_stage || ''
  ).toLowerCase();
  const project = inquiryProjectLabel(inq).toLowerCase();
  const unitLabel = inquiryUnitLabelFromRow(inq).toLowerCase();
  return (
    name.includes(q) ||
    phone.includes(q) ||
    email.includes(q) ||
    unitId.includes(q) ||
    unitCode.includes(q) ||
    unitLabel.includes(q) ||
    source.includes(q) ||
    ref.includes(q) ||
    stage.includes(q) ||
    project.includes(q)
  );
};

const equalsOrAll: FilterFn<InquiryRowDb> = (row, columnId, raw) => {
  const v = String(raw ?? '').trim();
  if (!v || v === '__all__') return true;
  return String(row.getValue(columnId) ?? '').trim() === v;
};

type StageTabId = 'all' | 'new' | (typeof INQUIRY_LIST_FUNNEL_STAGES)[number];

const STAGE_TABS: Array<{ id: StageTabId; label: string }> = [
  { id: 'all', label: 'All stages' },
  { id: 'new', label: 'New leads' },
  ...INQUIRY_LIST_FUNNEL_STAGES.filter((s) => s !== 'Enquiry').map((s) => ({
    id: s,
    label: s
  }))
];

function columnFilterToStageTab(
  filters: ColumnFiltersState
): StageTabId | null {
  const raw = filters.find((f) => f.id === 'funnelStage')?.value;
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (v === STAGE_FILTER_NEW_LEADS) return 'new';
  if (v === STAGE_FILTER_TOKEN) return 'Token';
  if ((INQUIRY_LIST_FUNNEL_STAGES as readonly string[]).includes(v)) {
    return v as StageTabId;
  }
  return null;
}

function inquiryMatchesStageTab(inq: InquiryRowDb, tabId: StageTabId): boolean {
  if (tabId === 'all') return true;
  const stage = String(inq.funnel_stage || '').trim();
  if (tabId === 'new') {
    return !stage || stage === 'Enquiry';
  }
  if (tabId === INQUIRY_CLOSED_FUNNEL_STAGE) {
    return (
      stage === INQUIRY_CLOSED_FUNNEL_STAGE ||
      isInquiryClosed(inq.stage_data, inq.funnel_stage)
    );
  }
  return stage === tabId;
}

type InquiryListTableProps = ServerSortedTableProps & {
  inquiries: InquiryRowDb[];
  loadingInquiries: boolean;
  loadInquiries: () => void | Promise<void>;
  units: UnitLabelRow[];
  navigateToBookingFromInquiry: (inq: InquiryRowDb) => void;
  urlColumnFilters?: ColumnFiltersState;
};

export function InquiryListTable({
  inquiries,
  loadingInquiries,
  loadInquiries,
  units,
  navigateToBookingFromInquiry,
  sorting,
  onSortingChange,
  urlColumnFilters = []
}: InquiryListTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState('');
  const [stageTab, setStageTab] = useState<StageTabId>(
    () => columnFilterToStageTab(urlColumnFilters) ?? 'new'
  );

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    urlColumnFilters.filter((f) => f.id !== 'funnelStage')
  );

  useEffect(() => {
    const fromUrl = columnFilterToStageTab(urlColumnFilters);
    if (fromUrl) setStageTab(fromUrl);
    setColumnFilters(urlColumnFilters.filter((f) => f.id !== 'funnelStage'));
  }, [urlColumnFilters]);

  const filteredRows = useMemo(
    () => inquiries.filter((inq) => inquiryMatchesStageTab(inq, stageTab)),
    [inquiries, stageTab]
  );

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inquiries.length };
    for (const t of STAGE_TABS) {
      if (t.id === 'all') continue;
      counts[t.id] = inquiries.filter((inq) =>
        inquiryMatchesStageTab(inq, t.id)
      ).length;
    }
    return counts;
  }, [inquiries]);

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) {
      if (!u?.id) continue;
      map.set(u.id, unitDisplayName(u));
    }
    return map;
  }, [units]);

  const leadSourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const inq of inquiries) {
      const src = normalizeLeadSource(String(inq.lead_source || ''));
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
              {formatDisplayDateTime(row.original.created_at)}
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
        id: 'project',
        header: 'Project',
        accessorFn: (row) => inquiryProjectLabel(row) || '—',
        cell: ({ getValue }) => (
          <span className="block max-w-[10rem] truncate text-sm text-muted-foreground">
            {String(getValue())}
          </span>
        ),
        enableGlobalFilter: true
      },
      {
        id: 'funnelStage',
        header: 'Stage',
        accessorFn: (row) => {
          if (isInquiryClosed(row.stage_data, row.funnel_stage)) {
            const reason = getInquiryClosedStatus(row.stage_data);
            return reason && reason !== 'Closed'
              ? `${INQUIRY_CLOSED_FUNNEL_STAGE} · ${reason}`
              : INQUIRY_CLOSED_FUNNEL_STAGE;
          }
          return String(row.funnel_stage || '').trim() || '—';
        },
        cell: ({ row, getValue }) => {
          const closed = isInquiryClosed(
            row.original.stage_data,
            row.original.funnel_stage
          );
          const label = String(getValue() || '—');
          const stageOnly = closed
            ? INQUIRY_CLOSED_FUNNEL_STAGE
            : String(row.original.funnel_stage || '').trim() || '—';
          return (
            <StatusChip tone={funnelStageTone(stageOnly)} uppercase>
              {label}
            </StatusChip>
          );
        }
      },
      {
        id: 'leadSource',
        header: 'Source',
        accessorFn: (row) => normalizeLeadSource(String(row.lead_source || '')),
        filterFn: equalsOrAll,
        cell: ({ row }) => {
          const src = normalizeLeadSource(String(row.original.lead_source || '')) || '—';
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
        accessorFn: (row) => inquiryUnitLabelFromRow(row),
        cell: ({ getValue }) => (
          <span className="block max-w-[14rem] truncate text-sm font-medium">
            {String(getValue())}
          </span>
        )
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
        header: 'Actions',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const inq = row.original;
          const closed = isInquiryClosed(inq.stage_data, inq.funnel_stage);
          if (closed) {
            const reason = getInquiryClosedStatus(inq.stage_data);
            return (
              <span className="px-1 text-[10px] font-medium text-muted-foreground">
                {reason && reason !== 'Closed'
                  ? `Closed · ${reason}`
                  : 'Closed'}
              </span>
            );
          }
          return (
            <TableRowActions
              actions={[
                {
                  id: 'pipeline',
                  label: 'Pipeline',
                  onClick: () =>
                    router.push(
                      `/crm/inquiry/new?inquiry=${encodeURIComponent(inq.id)}`
                    )
                },
                {
                  id: 'booking',
                  label: 'Booking',
                  icon: <ArrowRight className="size-3.5 opacity-90" />,
                  variant: 'default',
                  disabled: !inq.unit_id?.trim(),
                  title: inq.unit_id?.trim()
                    ? undefined
                    : 'Assign a unit before booking',
                  onClick: () => navigateToBookingFromInquiry(inq)
                }
              ]}
            />
          );
        }
      }
    ],
    [navigateToBookingFromInquiry, router, unitNameById]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { globalFilter, columnFilters, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange,
    onColumnSizingChange,
    globalFilterFn: globalInquiryFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10, pageIndex: 0 }
    },
    ...tableFeatures
  });

  const sourceCol = table.getColumn('leadSource');
  const sourceFilterVal = sourceCol?.getFilterValue();
  const sourceFilter =
    sourceFilterVal === undefined || sourceFilterVal === null
      ? ''
      : String(sourceFilterVal);

  return (
    <Card className="border-border p-4 shadow-sm" id="inquiry-list">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Inquiry list
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Table view with search, filters, and pagination.{' '}
            <span className="tabular-nums text-foreground">
              {loadingInquiries && inquiries.length === 0 ? (
                <CrmSkeletonBar className="inline-block w-16" />
              ) : (
                `${inquiries.length} loaded`
              )}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => void loadInquiries()}
          disabled={loadingInquiries}
        >
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
        {STAGE_TABS.map((t) => {
          const active = stageTab === t.id;
          const count = stageCounts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              className={cn(
                'px-3 py-2 text-xs font-medium',
                active
                  ? 'border-b-2 border-ds-primary-500 text-ds-primary-700'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setStageTab(t.id)}
            >
              {t.label}{' '}
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
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
            placeholder="Customer, phone, email, ref, unit, project, stage, source…"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">Lead source</Label>
            <SearchableSelect
              value={
                sourceFilter && sourceFilter !== '__all__'
                  ? sourceFilter
                  : 'All sources'
              }
              onValueChange={(v) =>
                sourceCol?.setFilterValue(v === 'All sources' ? undefined : v)
              }
              options={['All sources', ...leadSourceOptions]}
              placeholder="All sources"
              searchPlaceholder="Search source…"
              className="mt-1 w-full min-w-[10rem]"
            />
          </div>
          <div className="min-w-[8rem]">
            <Label className="text-xs text-muted-foreground">Rows per page</Label>
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
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full min-w-[56rem] caption-bottom text-sm text-foreground"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/60">
                {hg.headers.map((h) => (
                  <CrmDataTableHead key={h.id} header={h} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loadingInquiries && inquiries.length === 0 ? (
              <CrmTableBodySkeleton colSpan={columns.length} />
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  No enquiries match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
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
    </Card>
  );
}
