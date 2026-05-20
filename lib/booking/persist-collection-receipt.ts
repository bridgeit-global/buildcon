import type { SupabaseClient } from '@supabase/supabase-js';
import { generatedReceiptExistsForCollection } from '@/lib/booking/booking-generated-doc-kind';
import { requestGenerateBookingDocument } from '@/lib/booking/request-generate-booking-document';
import type { NotifyBookingDocumentResponse } from '@/lib/booking/notify-booking-document';

export type CollectionReceiptContext = {
  collectionId: string;
  receivedAmount: number;
  receivedAt: string | null;
  mode: string | null;
  reference: string | null;
  instalmentLabel: string | null;
};

export { generatedReceiptExistsForCollection } from '@/lib/booking/booking-generated-doc-kind';

/** Saves a payment receipt PDF linked to a collection; optionally emails / WhatsApp. */
export async function persistCollectionReceipt(
  _supabase: SupabaseClient,
  bookingId: string,
  collection: CollectionReceiptContext,
  opts?: { notify?: boolean }
): Promise<
  | { ok: true; id: string; notify?: NotifyBookingDocumentResponse }
  | { ok: false; error: string }
> {
  const result = await requestGenerateBookingDocument(bookingId, {
    kind: 'receipt',
    linkId: collection.collectionId,
    htmlOverrides: {
      receivedAmount: collection.receivedAmount,
      receivedAt: collection.receivedAt,
      paymentMode: collection.mode,
      paymentReference: collection.reference,
      instalmentLabel: collection.instalmentLabel
    },
    notify: opts?.notify !== false
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (opts?.notify === false) {
    return { ok: true, id: result.generatedDocumentId };
  }

  return {
    ok: true,
    id: result.generatedDocumentId,
    notify: result.notify
  };
}
