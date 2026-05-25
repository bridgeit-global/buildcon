import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import type { NotifyBookingDocumentResponse } from '@/lib/booking/notify-booking-document';

export type { NotifyBookingDocumentResponse };

/** Persists PDF to Storage + inserts `generated_documents`. Does NOT notify the customer. */
export async function generateAndNotifyBookingDocument(opts: {
  supabase: SupabaseClient;
  bookingId: string;
  pack: BookingPrintPack;
  kind: BookingDocumentPrintKind;
}): Promise<
  | { ok: true; generatedDocumentId: string; storagePath: string; notify?: NotifyBookingDocumentResponse }
  | { ok: false; error: string }
> {
  void opts.supabase;
  void opts.pack;

  const result = await requestGenerateBookingDocument(opts.bookingId, {
    kind: opts.kind,
    notify: false
  });

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    generatedDocumentId: result.generatedDocumentId,
    storagePath: result.storagePath
  };
}
