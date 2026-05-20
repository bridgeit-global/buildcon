import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import type { NotifyBookingDocumentResponse } from '@/lib/booking/notify-booking-document';

export type GenerateBookingDocumentBody = {
  kind: BookingDocumentPrintKind;
  linkId?: string | null;
  htmlOverrides?: BookingDocumentHtmlOverrides;
  notify?: boolean;
};

export type GenerateBookingDocumentResult =
  | {
      ok: true;
      generatedDocumentId: string;
      storagePath: string;
      notify?: NotifyBookingDocumentResponse;
    }
  | { ok: false; error: string };

/** Client-safe: POST to CRM API to persist PDF and optionally notify. */
export async function requestGenerateBookingDocument(
  bookingId: string,
  body: GenerateBookingDocumentBody
): Promise<GenerateBookingDocumentResult> {
  const res = await fetch(
    `/api/crm/bookings/${encodeURIComponent(bookingId)}/documents/generate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    }
  );
  const json = (await res.json()) as GenerateBookingDocumentResult & { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? 'Document generation failed' };
  }
  if (!json.ok) {
    return { ok: false, error: json.error ?? 'Document generation failed' };
  }
  return json;
}
