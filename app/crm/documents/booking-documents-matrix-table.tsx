'use client';

import { useCallback, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from '@tanstack/react-table';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import {
  BOOKING_DOCUMENT_KIND_LABEL,
  BOOKING_DOCUMENT_MATRIX_KINDS,
  parseKindFromBookingGeneratedPath,
  parseLinkIdFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format-display-date';
import type { GeneratedDocRow } from './generated-documents-table';
import { storageBucketForGeneratedPath } from './generated-documents-table';

export type BookingDocMatrixRow = {
  kind: BookingDocumentPrintKind;
  label: string;
  latest: GeneratedDocRow | null;
  /** All stored files for this kind (newest first). */
  versions: GeneratedDocRow[];
};

export function storedRowsForKind(
  rows: GeneratedDocRow[],
  kind: BookingDocumentPrintKind
): GeneratedDocRow[] {
  return rows
    .filter((r) => {
      if (storageBucketForGeneratedPath(r.storage_path) !== 'documents') return false;
      return parseKindFromBookingGeneratedPath(r.storage_path) === kind;
    })
    .sort(
      (a, b) =>
        new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );
}

function latestStoredRowForKind(
  rows: GeneratedDocRow[],
  kind: BookingDocumentPrintKind
): GeneratedDocRow | null {
  const matches = storedRowsForKind(rows, kind);
  return matches[0] ?? null;
}

function buildMatrixRows(generated: GeneratedDocRow[]): BookingDocMatrixRow[] {
  return BOOKING_DOCUMENT_MATRIX_KINDS.map((kind) => {
    const versions = storedRowsForKind(generated, kind);
    return {
      kind,
      label: BOOKING_DOCUMENT_KIND_LABEL[kind],
      latest: versions[0] ?? null,
      versions
    };
  });
}

type BookingDocumentsMatrixTableProps = {
  rows: BookingDocMatrixRow[];
  kycComplete: boolean;
  generatingKind: BookingDocumentPrintKind | null;
  onGenerate: (kind: BookingDocumentPrintKind) => void | Promise<void>;
  /** Maps schedule/collection id from filename to instalment label. */
  scheduleLabelById?: Map<string, string>;
  /** Outstanding rupee amount across the unit's payment schedule, if known. */
  outstandingTotal?: number | null;
};

const KIND_PREDECESSORS: Partial<Record<BookingDocumentPrintKind, BookingDocumentPrintKind[]>> = {
  'allotment-letter': ['application-form'],
  agreement: ['allotment-letter'],
  'registration-deed': ['agreement'],
  'possession-letter': ['registration-deed']
};

const KIND_REQUIRES_FULLY_PAID = new Set<BookingDocumentPrintKind>([
  'agreement',
  'registration-deed',
  'possession-letter'
]);

const KIND_REQUIRES_KYC = new Set<BookingDocumentPrintKind>([
  'application-form',
  'allotment-letter',
  'agreement',
  'registration-deed',
  'possession-letter'
]);

function generateDisabledReason(
  kind: BookingDocumentPrintKind,
  ctx: {
    kycComplete: boolean;
    presentKinds: Set<BookingDocumentPrintKind>;
    outstandingTotal: number | null | undefined;
  }
): string | null {
  if (!ctx.kycComplete && KIND_REQUIRES_KYC.has(kind)) {
    return 'Complete KYC (PAN + Aadhaar for primary buyer and each co-applicant) before generating this document.';
  }
  const preds = KIND_PREDECESSORS[kind];
  if (preds) {
    const missing = preds.find((k) => !ctx.presentKinds.has(k));
    if (missing) {
      return `Generate the ${BOOKING_DOCUMENT_KIND_LABEL[missing]} first.`;
    }
  }
  if (KIND_REQUIRES_FULLY_PAID.has(kind)) {
    const outstanding = ctx.outstandingTotal ?? null;
    if (outstanding != null && outstanding > 0) {
      return `Settle all payment instalments first. Outstanding: ₹${Math.round(outstanding).toLocaleString('en-IN')}.`;
    }
  }
  return null;
}

function linkLabelForRow(
  row: GeneratedDocRow,
  scheduleLabelById?: Map<string, string>
): string | null {
  const linkId = parseLinkIdFromBookingGeneratedPath(row.storage_path);
  if (!linkId) return null;
  return scheduleLabelById?.get(linkId) ?? `Linked · ${linkId.slice(0, 8)}…`;
}

export function BookingDocumentsMatrixTable({
  rows,
  kycComplete,
  generatingKind,
  onGenerate,
  scheduleLabelById,
  outstandingTotal
}: BookingDocumentsMatrixTableProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);

  const presentKinds = useMemo(() => {
    const set = new Set<BookingDocumentPrintKind>();
    for (const row of rows) {
      if (row.versions.length > 0) set.add(row.kind);
    }
    return set;
  }, [rows]);

  const downloadRow = useCallback(
    async (row: GeneratedDocRow) => {
      const bucket = storageBucketForGeneratedPath(row.storage_path);
      if (!bucket) {
        pageError('No file in storage for this row.');
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

  const columns = useMemo<ColumnDef<BookingDocMatrixRow, unknown>[]>(
    () => [
      {
        id: 'document',
        header: 'Document',
        accessorKey: 'label',
        cell: ({ row }) => (
          <span className="font-medium text-ds-gray-900">{row.original.label}</span>
        )
      },
      {
        id: 'status',
        header: 'Last generated',
        accessorFn: (r) => r.latest?.generated_at ?? '',
        cell: ({ row }) => {
          const { latest, versions, kind } = row.original;
          if (!latest) {
            return <span className="text-sm text-ds-gray-500">Not generated yet</span>;
          }
          const multi = versions.length > 1;
          const showLinked =
            kind === 'receipt' || kind === 'demand-letter';
          const recent =
            showLinked && multi ? versions.slice(0, 3) : [latest];
          return (
            <div className="text-sm text-ds-gray-600">
              <span className="whitespace-nowrap">
                Latest {formatDisplayDateTime(latest.generated_at)}
              </span>
              {showLinked && recent.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-ds-primary-800">
                  {recent.map((v) => {
                    const lbl = linkLabelForRow(v, scheduleLabelById);
                    return (
                      <li key={v.id}>
                        {lbl ?? 'Saved PDF'} ·{' '}
                        {formatDisplayDate(v.generated_at)}
                      </li>
                    );
                  })}
                  {multi && versions.length > 3 ? (
                    <li className="text-ds-gray-500">
                      +{versions.length - 3} more in History below
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        }
      },
      {
        id: 'generate',
        header: 'Generate',
        enableSorting: false,
        cell: ({ row }) => {
          const k = row.original.kind;
          const busy = generatingKind === k;
          const blocked = generateDisabledReason(k, {
            kycComplete,
            presentKinds,
            outstandingTotal
          });
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={busy || Boolean(blocked)}
              onClick={() => void onGenerate(k)}
              title={blocked ?? undefined}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Working…' : 'Generate'}
            </Button>
          );
        }
      },
      {
        id: 'download',
        header: 'Download',
        enableSorting: false,
        cell: ({ row }) => {
          const latest = row.original.latest;
          if (!latest) {
            return <span className="text-xs text-ds-gray-500">Generate first</span>;
          }
          const busy = downloadBusyId === latest.id;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={busy}
              onClick={() => void downloadRow(latest)}
            >
              <Download className="h-4 w-4" />
              {busy ? '…' : 'Download'}
            </Button>
          );
        }
      }
    ],
    [
      downloadBusyId,
      downloadRow,
      generatingKind,
      kycComplete,
      onGenerate,
      outstandingTotal,
      presentKinds,
      scheduleLabelById
    ]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table className="w-full min-w-xl caption-bottom text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-ds-gray-200 bg-ds-gray-50 text-left text-xs font-semibold text-ds-gray-500"
              >
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-ds-gray-100">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ds-gray-500">
        Files are stored as PDF in Documents. Receipts and demand letters from Financials and CLD
        completions appear here automatically. Email/WhatsApp runs when you use Generate with notify
        enabled.
      </p>
    </div>
  );
}

export { buildMatrixRows, latestStoredRowForKind };
