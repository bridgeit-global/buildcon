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

const KIND_PATH_RE =
  /\/booking-generated\/[^/]+\/(application-form|allotment-letter|receipt|demand-letter|agreement)-[0-9a-f-]+\.html$/i;

/** Parses document kind from a stored CRM path, or null for print logs / other paths. */
export function parseKindFromBookingGeneratedPath(storagePath: string): BookingDocumentPrintKind | null {
  const m = storagePath.match(KIND_PATH_RE);
  if (!m?.[1]) return null;
  return m[1] as BookingDocumentPrintKind;
}
