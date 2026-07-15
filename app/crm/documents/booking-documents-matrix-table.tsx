'use client';

import { useCallback, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  useCrmTableFeatures,
  type ServerSortedTableProps
} from '@/components/data-table/crm-table-features';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from '@tanstack/react-table';
import { Eye, Loader2, Send, Sparkles } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PdfViewerDialog } from '@/components/pdf-viewer-dialog';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import {
  BOOKING_DOCUMENT_KIND_LABEL,
  BOOKING_DOCUMENT_MATRIX_KINDS,
  parseKindFromBookingGeneratedPath
} from '@/lib/booking/booking-generated-doc-kind';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE } from '../inventory/unit-status';
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

type BookingDocumentsMatrixTableProps = ServerSortedTableProps & {
  rows: BookingDocMatrixRow[];
  kycComplete: boolean;
  generatingKind: BookingDocumentPrintKind | null;
  onGenerate: (kind: BookingDocumentPrintKind) => void | Promise<void>;
  /** Notify (email/SMS/WhatsApp) for a specific generated document. */
  onNotify?: (generatedDocumentId: string) => void | Promise<void>;
  /** Maps schedule/collection id from filename to instalment label. */
  scheduleLabelById?: Map<string, string>;
  /** Outstanding rupee amount across the unit's payment schedule, if known. */
  outstandingTotal?: number | null;
  /** Unit lifecycle is Possession given — block new generation. */
  unitPossessed?: boolean;
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
    unitPossessed?: boolean;
  }
): string | null {
  if (ctx.unitPossessed) {
    return UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE;
  }
  if (!ctx.kycComplete && KIND_REQUIRES_KYC.has(kind)) {
    return 'Complete KYC (PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads for each applicant) before generating this document.';
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

export function BookingDocumentsMatrixTable({
  rows,
  kycComplete,
  generatingKind,
  onGenerate,
  onNotify,
  scheduleLabelById,
  outstandingTotal,
  unitPossessed = false,
  sorting,
  onSortingChange
}: BookingDocumentsMatrixTableProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [viewBusyId, setViewBusyId] = useState<string | null>(null);
  const [notifyBusyId, setNotifyBusyId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const presentKinds = useMemo(() => {
    const set = new Set<BookingDocumentPrintKind>();
    for (const row of rows) {
      if (row.versions.length > 0) set.add(row.kind);
    }
    return set;
  }, [rows]);

  const viewRow = useCallback(
    async (row: GeneratedDocRow, label: string) => {
      const bucket = storageBucketForGeneratedPath(row.storage_path);
      if (!bucket) {
        pageError('No file in storage for this row.');
        return;
      }
      setViewBusyId(row.id);
      try {
        const { data, error: urlErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(row.storage_path, 3600);
        if (urlErr || !data?.signedUrl) {
          throw urlErr ?? new Error('No preview URL');
        }
        setViewerUrl(data.signedUrl);
        setViewerTitle(label);
        setViewerOpen(true);
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setViewBusyId(null);
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
          <span className="font-medium text-foreground">{row.original.label}</span>
        )
      },
      {
        id: 'status',
        header: 'Last generated',
        accessorFn: (r) => r.latest?.generated_at ?? '',
        cell: ({ row }) => {
          const { latest } = row.original;
          if (!latest) {
            return <span className="text-sm text-muted-foreground">Not generated yet</span>;
          }
          return (
            <div className="text-sm text-muted-foreground">
              <span className="whitespace-nowrap">
                Latest {formatDisplayDateTime(latest.generated_at)}
              </span>
            </div>
          );
        }
      },
      {
        id: 'generate',
        header: 'Generate',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => {
          const k = row.original.kind;
          const busy = generatingKind === k;
          const blocked = generateDisabledReason(k, {
            kycComplete,
            presentKinds,
            outstandingTotal,
            unitPossessed
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
        id: 'review',
        header: 'Review',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => {
          const latest = row.original.latest;
          if (!latest) {
            return <span className="text-xs text-muted-foreground">Generate first</span>;
          }
          const busy = viewBusyId === latest.id;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={busy}
              onClick={() => void viewRow(latest, row.original.label)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {busy ? '…' : 'View'}
            </Button>
          );
        }
      },
      {
        id: 'send',
        header: 'Send',
        enableSorting: false,
        enableResizing: false,
        size: 96,
        cell: ({ row }) => {
          const latest = row.original.latest;
          if (!latest) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const busy = notifyBusyId === latest.id;
          return (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1"
              disabled={busy || !onNotify}
              onClick={async () => {
                if (!onNotify) return;
                setNotifyBusyId(latest.id);
                try {
                  await onNotify(latest.id);
                } finally {
                  setNotifyBusyId(null);
                }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? 'Sending…' : 'Send'}
            </Button>
          );
        }
      }
    ],
    [
      viewBusyId,
      viewRow,
      generatingKind,
      kycComplete,
      notifyBusyId,
      onGenerate,
      onNotify,
      outstandingTotal,
      presentKinds,
      unitPossessed
    ]
  );

  const { columnSizing, onColumnSizingChange, tableFeatures } = useCrmTableFeatures({
    serverSorting: true
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    ...tableFeatures
  });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full min-w-xl caption-bottom text-sm text-foreground"
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <CrmDataTableCell key={cell.id} cell={cell} className="align-top" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unitPossessed ? (
        <p className="text-xs text-ds-warning-800">{UNIT_POSSESSED_NO_DOCUMENTS_MESSAGE}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Files are stored as PDF in Documents. After generating, use View to review the document,
          then Send to notify the customer via email / SMS / WhatsApp.
        </p>
      )}
      <PdfViewerDialog
        open={viewerOpen}
        onOpenChange={(open) => {
          setViewerOpen(open);
          if (!open) setViewerUrl('');
        }}
        url={viewerUrl}
        title={viewerTitle}
      />
    </div>
  );
}

export { buildMatrixRows, latestStoredRowForKind };
