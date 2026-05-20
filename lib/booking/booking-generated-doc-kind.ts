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

/** Parses document kind from a stored CRM path, or null for print logs / other paths. */
export function parseKindFromBookingGeneratedPath(storagePath: string): BookingDocumentPrintKind | null {
  const name = storagePath.split('/').pop() ?? '';
  if (!name.endsWith('.html')) return null;
  for (const kind of BOOKING_DOCUMENT_MATRIX_KINDS) {
    if (name.startsWith(`${kind}-`)) return kind;
  }
  return null;
}

/** Optional collection or schedule id in filename: `{kind}--{linkId}--{fileId}.html`. */
export function parseLinkIdFromBookingGeneratedPath(storagePath: string): string | null {
  const name = storagePath.split('/').pop() ?? '';
  if (!name.endsWith('.html')) return null;
  const base = name.slice(0, -'.html'.length);
  if (!base.includes('--')) return null;
  const parts = base.split('--');
  if (parts.length !== 3) return null;
  return parts[1]?.trim() || null;
}
