import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { persistGeneratedBookingDocument } from '@/lib/booking/persist-generated-booking-document';
import {
  notifyGeneratedBookingDocument,
  type NotifyBookingDocumentResponse
} from '@/lib/booking/notify-booking-document';

export type { NotifyBookingDocumentResponse };

/** Persists HTML to Storage, inserts `generated_documents`, then emails / WhatsApp (when configured). */
export async function generateAndNotifyBookingDocument(opts: {
  supabase: SupabaseClient;
  bookingId: string;
  pack: BookingPrintPack;
  kind: BookingDocumentPrintKind;
}): Promise<
  | { ok: true; generatedDocumentId: string; notify: NotifyBookingDocumentResponse }
  | { ok: false; error: string }
> {
  const persisted = await persistGeneratedBookingDocument(opts.supabase, opts.pack, opts.kind);
  if (!persisted.ok) return { ok: false, error: persisted.error };

  const notify = await notifyGeneratedBookingDocument(opts.bookingId, persisted.id);

  if (!notify.ok) {
    return {
      ok: false,
      error:
        typeof notify.error === 'string'
          ? notify.error
          : 'Document was saved but notifying the customer failed.'
    };
  }

  return { ok: true, generatedDocumentId: persisted.id, notify };
}
