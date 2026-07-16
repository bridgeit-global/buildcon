import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { BOOKING_DOCUMENT_KIND_LABEL } from '@/lib/booking/booking-generated-doc-kind';

/**
 * Document kinds that support project-scoped HTML templates.
 * Must stay aligned with every `BookingDocumentPrintKind` used in generation.
 */
export const DOCUMENT_TEMPLATE_KINDS = [
  'application-form',
  'allotment-letter',
  'receipt',
  'demand-letter',
  'agreement',
  'registration-deed',
  'possession-letter'
] as const satisfies readonly BookingDocumentPrintKind[];

export type DocumentTemplateKind = (typeof DOCUMENT_TEMPLATE_KINDS)[number];

export const DOCUMENT_TEMPLATE_KIND_LABEL: Record<DocumentTemplateKind, string> = {
  'application-form': BOOKING_DOCUMENT_KIND_LABEL['application-form'],
  'allotment-letter': BOOKING_DOCUMENT_KIND_LABEL['allotment-letter'],
  receipt: BOOKING_DOCUMENT_KIND_LABEL.receipt,
  'demand-letter': BOOKING_DOCUMENT_KIND_LABEL['demand-letter'],
  agreement: BOOKING_DOCUMENT_KIND_LABEL.agreement,
  'registration-deed': BOOKING_DOCUMENT_KIND_LABEL['registration-deed'],
  'possession-letter': BOOKING_DOCUMENT_KIND_LABEL['possession-letter']
};

export function isDocumentTemplateKind(value: string): value is DocumentTemplateKind {
  return (DOCUMENT_TEMPLATE_KINDS as readonly string[]).includes(value);
}

export type DocumentTemplateRow = {
  id: string;
  project_id: string;
  name: string;
  category: string;
  doc_kind: DocumentTemplateKind;
  body: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
