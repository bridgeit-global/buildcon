'use client';

import { useCallback, useMemo, useState } from 'react';
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
  parseKindFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';
import type { GeneratedDocRow } from './generated-documents-table';
import { storageBucketForGeneratedPath } from './generated-documents-table';

export type BookingDocMatrixRow = {
  kind: BookingDocumentPrintKind;
  label: string;
  latest: GeneratedDocRow | null;
};

function latestStoredRowForKind(
  rows: GeneratedDocRow[],
  kind: BookingDocumentPrintKind
): GeneratedDocRow | null {
  const matches = rows.filter((r) => {
    if (storageBucketForGeneratedPath(r.storage_path) !== 'documents') return false;
    return parseKindFromBookingGeneratedPath(r.storage_path) === kind;
  });
  if (matches.length === 0) return null;
  return matches.reduce((a, b) =>
    new Date(a.generated_at).getTime() >= new Date(b.generated_at).getTime() ? a : b
  );
}

function buildMatrixRows(generated: GeneratedDocRow[]): BookingDocMatrixRow[] {
  return BOOKING_DOCUMENT_MATRIX_KINDS.map((kind) => ({
    kind,
    label: BOOKING_DOCUMENT_KIND_LABEL[kind],
    latest: latestStoredRowForKind(generated, kind)
  }));
}

type BookingDocumentsMatrixTableProps = {
  rows: BookingDocMatrixRow[];
  kycComplete: boolean;
  generatingKind: BookingDocumentPrintKind | null;
  onGenerate: (kind: BookingDocumentPrintKind) => void | Promise<void>;
};

export function BookingDocumentsMatrixTable({
  rows,
  kycComplete,
  generatingKind,
  onGenerate
}: BookingDocumentsMatrixTableProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');

  const downloadRow = useCallback(
    async (row: GeneratedDocRow) => {
      const bucket = storageBucketForGeneratedPath(row.storage_path);
      if (!bucket) {
        setDownloadError('No file in storage for this row.');
        return;
      }
      setDownloadError('');
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
        setDownloadError(e instanceof Error ? e.message : 'Download failed');
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
          const latest = row.original.latest;
          if (!latest) {
            return <span className="text-sm text-ds-gray-500">Not generated yet</span>;
          }
          return (
            <span className="whitespace-nowrap text-sm text-ds-gray-600">
              {new Date(latest.generated_at).toLocaleString()}
            </span>
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
          const disabledApp = k === 'application-form' && !kycComplete;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={busy || disabledApp}
              onClick={() => void onGenerate(k)}
              title={
                disabledApp
                  ? 'Complete KYC for all applicants before generating the application form.'
                  : undefined
              }
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
    [downloadBusyId, downloadRow, generatingKind, kycComplete, onGenerate]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="space-y-2">
      {downloadError ? (
        <p className="text-sm text-ds-error-700">{downloadError}</p>
      ) : null}
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
        Files are stored as HTML (open in the browser, then Print → Save as PDF if needed). After each
        generate, the app emails the buyer when{' '}
        <span className="font-medium">RESEND_API_KEY</span> and{' '}
        <span className="font-medium">CRM_DOCUMENTS_EMAIL_FROM</span> are set, and opens a prefilled
        WhatsApp message when a mobile number is on file.
      </p>
    </div>
  );
}

export { buildMatrixRows, latestStoredRowForKind };
