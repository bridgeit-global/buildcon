'use client';

import Link from 'next/link';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { pageError } from '@/lib/toast';
import { useCallback, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  parseKindFromBookingGeneratedPath,
  parseLinkIdFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';
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
export type GeneratedDocRow = {
  id: string;
  project_id: string;
  booking_id: string | null;
  customer_id: string | null;
  template_id: string | null;
  storage_path: string;
  generated_at: string;
  projects: { name: string } | { name: string }[] | null;
  bookings:
    | {
        id: string;
        units:
          | { unit_code: string }
          | { unit_code: string }[]
          | null;
      }
    | {
        id: string;
        units:
          | { unit_code: string }
          | { unit_code: string }[]
          | null;
      }[]
    | null;
  customers: { full_name: string } | { full_name: string }[] | null;
};

function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function projectLabel(p: { name: string } | { name: string }[] | null | undefined) {
  if (!p) return '—';
  const row = Array.isArray(p) ? p[0] : p;
  return row?.name ?? '—';
}

function customerLabel(c: { full_name: string } | { full_name: string }[] | null | undefined) {
  if (!c) return '—';
  const row = Array.isArray(c) ? c[0] : c;
  return row?.full_name ?? '—';
}

function unitCodeFromBooking(
  b: GeneratedDocRow['bookings']
): string {
  const row = unwrapJoin(b);
  if (!row) return '—';
  const u = unwrapJoin(row.units);
  return u?.unit_code ?? '—';
}

const DOCUMENTS_BUCKET = 'documents';

export function storageBucketForGeneratedPath(storagePath: string): string | null {
  if (storagePath.startsWith('documents/')) return DOCUMENTS_BUCKET;
  if (storagePath.startsWith('kyc/')) return 'kyc';
  return null;
}

export function formatGeneratedDocKind(
  storagePath: string,
  hasTemplate: boolean,
  scheduleLabelById?: Map<string, string>
): string {
  if (storagePath.includes('/booking-generated/')) {
    const kind = parseKindFromBookingGeneratedPath(storagePath);
    const linkId = parseLinkIdFromBookingGeneratedPath(storagePath);
    const linkNote = linkId
      ? scheduleLabelById?.get(linkId)
        ? ` · ${scheduleLabelById.get(linkId)}`
        : ' · linked entry'
      : '';
    if (kind === 'application-form') return 'Application form';
    if (kind === 'allotment-letter') return 'Allotment letter';
    if (kind === 'receipt') return `Payment receipt${linkNote}`;
    if (kind === 'demand-letter') return `Demand letter${linkNote}`;
    if (kind === 'agreement') return 'Draft sale agreement';
    if (kind === 'registration-deed') return 'Registration deed';
    if (kind === 'possession-letter') return 'Possession letter';
    return 'Booking document (file)';
  }
  if (storagePath.startsWith('print/application-form/')) return 'Application form (print log)';
  if (storagePath.startsWith('print/allotment-letter/')) return 'Allotment letter (print log)';
  if (storagePath.startsWith('print/receipt/')) return 'Receipt (print log)';
  if (storagePath.startsWith('print/demand-letter/')) return 'Demand letter (print log)';
  if (storagePath.startsWith('print/agreement/')) return 'Agreement (print log)';
  if (storagePath.startsWith('print/registration-deed/')) return 'Registration deed (print log)';
  if (storagePath.startsWith('print/possession-letter/')) return 'Possession letter (print log)';
  if (hasTemplate) return 'From template';
  return 'Other';
}

const globalGeneratedFilter: FilterFn<GeneratedDocRow> = (row, _columnId, raw) => {
  const q = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    projectLabel(r.projects),
    customerLabel(r.customers),
    unitCodeFromBooking(r.bookings),
    r.storage_path,
    formatGeneratedDocKind(r.storage_path, Boolean(r.template_id))
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

type GeneratedDocumentsTableProps = {
  rows: GeneratedDocRow[];
  loading: boolean;
  /** Fewer columns when viewing a single booking. */
  variant?: 'default' | 'bookingFocus';
  /** Signed URL download for rows backed by storage (e.g. `documents/…`). */
  showDownload?: boolean;
  onRefresh?: () => void;
  scheduleLabelById?: Map<string, string>;
};

export function GeneratedDocumentsTable({
  rows,
  loading,
  variant = 'default',
  showDownload = false,
  onRefresh,
  scheduleLabelById
}: GeneratedDocumentsTableProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [globalFilter, setGlobalFilter] = useState('');
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);

  const downloadRow = useCallback(
    async (row: GeneratedDocRow) => {
      const bucket = storageBucketForGeneratedPath(row.storage_path);
      if (!bucket) {
        pageError('This row is a print log only; there is no file in storage yet.');
        return;
      }
            setDownloadBusyId(row.id);
      try {
        const { data, error: urlErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(row.storage_path, 3600);
        if (urlErr || !data?.signedUrl) {
          throw urlErr ?? new Error('No download URL');
        }
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Download failed');
      } finally {
        setDownloadBusyId(null);
      }
    },
    [supabase]
  );

  const columns = useMemo<ColumnDef<GeneratedDocRow, unknown>[]>(() => {
    const kindCol: ColumnDef<GeneratedDocRow, unknown> = {
      id: 'kind',
      header: 'Kind',
      accessorFn: (row) =>
        formatGeneratedDocKind(row.storage_path, Boolean(row.template_id), scheduleLabelById),
      cell: ({ row }) => (
        <span className="text-ds-gray-800">
          {formatGeneratedDocKind(
            row.original.storage_path,
            Boolean(row.original.template_id),
            scheduleLabelById
          )}
        </span>
      )
    };
    const generatedCol: ColumnDef<GeneratedDocRow, unknown> = {
      id: 'generated_at',
      header: 'Generated',
      accessorKey: 'generated_at',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-ds-gray-600">
          {formatDisplayDateTime(String(getValue()))}
        </span>
      )
    };
    const pathCol: ColumnDef<GeneratedDocRow, unknown> = {
      id: 'storage_path',
      header: 'Record',
      accessorKey: 'storage_path',
      cell: ({ getValue }) => (
        <span className="max-w-[220px] truncate font-mono text-[11px] text-ds-gray-600">
          {String(getValue())}
        </span>
      )
    };
    const downloadCol: ColumnDef<GeneratedDocRow, unknown> = {
      id: 'download',
      header: 'Download',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const bucket = storageBucketForGeneratedPath(r.storage_path);
        const busy = downloadBusyId === r.id;
        if (!showDownload) return <span className="text-ds-gray-400">—</span>;
        if (!bucket) {
          return <span className="text-xs text-ds-gray-500">Print log</span>;
        }
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={busy}
            onClick={() => void downloadRow(r)}
          >
            <Download className="h-4 w-4" />
            {busy ? '…' : 'Download'}
          </Button>
        );
      }
    };

    if (variant === 'bookingFocus') {
      const cols: ColumnDef<GeneratedDocRow, unknown>[] = [kindCol, generatedCol];
      if (!showDownload) cols.push(pathCol);
      else cols.push(pathCol, downloadCol);
      return cols;
    }

    return [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => projectLabel(row.projects),
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{projectLabel(row.original.projects)}</span>
        )
      },
      kindCol,
      {
        id: 'booking',
        header: 'Booking / unit',
        accessorFn: (row) => `${row.booking_id ?? ''} ${unitCodeFromBooking(row.bookings)}`,
        cell: ({ row }) => {
          const id = row.original.booking_id;
          const code = unitCodeFromBooking(row.original.bookings);
          if (!id) return <span className="text-ds-gray-500">—</span>;
          return (
            <div className="min-w-[8rem]">
              <Link
                className="font-medium text-ds-primary-600 underline-offset-2 hover:underline"
                href={`/crm/bookings/${id}`}
              >
                {code}
              </Link>
              <div className="mt-0.5 font-mono text-[11px] text-ds-gray-500">{id.slice(0, 8)}…</div>
            </div>
          );
        }
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => customerLabel(row.customers),
        cell: ({ row }) => (
          <span className="text-ds-gray-700">{customerLabel(row.original.customers)}</span>
        )
      },
      generatedCol,
      pathCol,
      ...(showDownload ? [downloadCol] : [])
    ];
  }, [variant, showDownload, downloadBusyId, downloadRow, scheduleLabelById]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalGeneratedFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1">
          <Label className="text-ds-gray-600">Search generated</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-gray-400" />
            <Input
              className="pl-9"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Project, unit, customer, path…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          ) : null}
          <Label className="sr-only sm:not-sr-only sm:text-ds-gray-600">Rows</Label>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="w-[100px]">
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

      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table
          className={
            variant === 'bookingFocus'
              ? 'w-full min-w-[40rem] caption-bottom text-sm'
              : 'w-full min-w-[56rem] caption-bottom text-sm'
          }
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-ds-gray-200 bg-ds-gray-50 text-left text-xs font-semibold text-ds-gray-500">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-ds-gray-500">
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-ds-gray-500">
                  {rows.length === 0
                    ? 'No generated records yet.'
                    : 'No rows match your search.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-ds-gray-100">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ds-gray-500">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
