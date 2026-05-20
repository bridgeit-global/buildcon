import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';

export const BOOKING_DOCUMENT_MATRIX_KINDS: BookingDocumentPrintKind[] = [
  'application-form',
  'allotment-letter',
  'receipt',
  'demand-letter',
  'agreement'
];

export const BOOKING_DOCUMENT_KIND_LABEL: Record<BookingDocumentPrintKind, string> = {
  'application-form': 'Application form',
  'allotment-letter': 'Allotment letter',
  receipt: 'Payment receipt',
  'demand-letter': 'Demand letter',
  agreement: 'Draft sale agreement'
};

function fileBaseName(storagePath: string): string | null {
  const name = storagePath.split('/').pop() ?? '';
  if (name.endsWith('.html')) return name.slice(0, -'.html'.length);
  if (name.endsWith('.pdf')) return name.slice(0, -'.pdf'.length);
  return null;
}

/** Parses document kind from a stored CRM path, or null for print logs / other paths. */
export function parseKindFromBookingGeneratedPath(
  storagePath: string
): BookingDocumentPrintKind | null {
  const base = fileBaseName(storagePath);
  if (!base) return null;
  for (const kind of BOOKING_DOCUMENT_MATRIX_KINDS) {
    if (base.startsWith(`${kind}-`)) return kind;
  }
  return null;
}

/** Optional collection or schedule id in filename: `{kind}--{linkId}--{fileId}.pdf`. */
export function parseLinkIdFromBookingGeneratedPath(storagePath: string): string | null {
  const base = fileBaseName(storagePath);
  if (!base || !base.includes('--')) return null;
  const parts = base.split('--');
  if (parts.length !== 3) return null;
  return parts[1]?.trim() || null;
}

/** True if a stored receipt already exists for this collection id. */
export function generatedReceiptExistsForCollection(
  generated: { storage_path: string }[],
  collectionId: string
): boolean {
  return generated.some((row) => {
    if (parseKindFromBookingGeneratedPath(row.storage_path) !== 'receipt') return false;
    return parseLinkIdFromBookingGeneratedPath(row.storage_path) === collectionId;
  });
}

/** True if a demand letter PDF/HTML already exists for this schedule id. */
export function generatedDemandExistsForSchedule(
  generated: { storage_path: string }[],
  scheduleId: string
): boolean {
  return generated.some((row) => {
    if (parseKindFromBookingGeneratedPath(row.storage_path) !== 'demand-letter') return false;
    return parseLinkIdFromBookingGeneratedPath(row.storage_path) === scheduleId;
  });
}
