import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import {
  applyDocumentTemplatePlaceholders,
  buildDocumentTemplateValues
} from '@/lib/document-template/placeholders';

/** Render uploaded HTML template with booking print-pack values. */
export function renderDocumentTemplateHtml(
  templateBody: string,
  pack: BookingPrintPack,
  overrides?: BookingDocumentHtmlOverrides
): string {
  const values = buildDocumentTemplateValues(pack, overrides);
  return applyDocumentTemplatePlaceholders(templateBody, values);
}
