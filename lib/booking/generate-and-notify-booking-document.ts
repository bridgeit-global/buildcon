import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { persistGeneratedBookingDocument } from '@/lib/booking/persist-generated-booking-document';

export type NotifyBookingDocumentResponse = {
  ok: boolean;
  docLabel?: string;
  emailSent?: boolean;
  emailSkippedReason?: string;
  whatsappUrl?: string | null;
  whatsappSkippedReason?: string;
  error?: string;
};

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

  const res = await fetch(`/api/crm/bookings/${encodeURIComponent(opts.bookingId)}/documents/notify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generatedDocumentId: persisted.id })
  });

  let notify: NotifyBookingDocumentResponse;
  try {
    notify = (await res.json()) as NotifyBookingDocumentResponse;
  } catch {
    return {
      ok: false,
      error: 'Document was saved but customer notification response was invalid.'
    };
  }

  if (!res.ok) {
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
