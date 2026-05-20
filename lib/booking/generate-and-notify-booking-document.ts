import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import type { NotifyBookingDocumentResponse } from '@/lib/booking/notify-booking-document';

export type { NotifyBookingDocumentResponse };

/** Persists PDF to Storage, inserts `generated_documents`, then emails / WhatsApp (when configured). */
export async function generateAndNotifyBookingDocument(opts: {
  supabase: SupabaseClient;
  bookingId: string;
  pack: BookingPrintPack;
  kind: BookingDocumentPrintKind;
}): Promise<
  | { ok: true; generatedDocumentId: string; notify: NotifyBookingDocumentResponse }
  | { ok: false; error: string }
> {
  void opts.supabase;
  void opts.pack;

  const result = await requestGenerateBookingDocument(opts.bookingId, {
    kind: opts.kind,
    notify: true
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (!result.notify) {
    return {
      ok: false,
      error: 'Document was saved but notification response was missing.'
    };
  }

  return {
    ok: true,
    generatedDocumentId: result.generatedDocumentId,
    notify: result.notify
  };
}
