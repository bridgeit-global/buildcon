import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';

export type { BookingDocumentHtmlOverrides } from '@/lib/booking/booking-document-html-from-pack';

export type PersistGeneratedBookingDocumentOpts = {
  linkId?: string | null;
  htmlOverrides?: BookingDocumentHtmlOverrides;
  notify?: boolean;
};

/**
 * Persists a booking document as PDF via the server generate API.
 * `supabase` and `pack` are kept for call-site compatibility; the server reloads the pack.
 */
export async function persistGeneratedBookingDocument(
  _supabase: SupabaseClient,
  pack: BookingPrintPack,
  kind: BookingDocumentPrintKind,
  opts?: PersistGeneratedBookingDocumentOpts
): Promise<{ ok: true; id: string; storagePath: string } | { ok: false; error: string }> {
  const bookingId = pack.booking.id;
  const result = await requestGenerateBookingDocument(bookingId, {
    kind,
    linkId: opts?.linkId,
    htmlOverrides: opts?.htmlOverrides,
    notify: opts?.notify ?? false
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    id: result.generatedDocumentId,
    storagePath: result.storagePath
  };
}
