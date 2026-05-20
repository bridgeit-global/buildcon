import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { persistGeneratedBookingDocument } from '@/lib/booking/persist-generated-booking-document';
import { parseKindFromBookingGeneratedPath, parseLinkIdFromBookingGeneratedPath } from '@/lib/booking/booking-generated-doc-kind';
import {
  notifyGeneratedBookingDocument,
  type NotifyBookingDocumentResponse
} from '@/lib/booking/notify-booking-document';

export type CollectionReceiptContext = {
  collectionId: string;
  receivedAmount: number;
  receivedAt: string | null;
  mode: string | null;
  reference: string | null;
  instalmentLabel: string | null;
};

/** True if a stored receipt already exists for this collection id. */
export function generatedReceiptExistsForCollection(
  generated: { storage_path: string }[],
  collectionId: string
): boolean {
  return generated.some((row) => {
    if (parseKindFromBookingGeneratedPath(row.storage_path) !== 'receipt') return false;
    return parseLinkIdFromBookingGeneratedPath(row.storage_path) === collectionId;
  });
}

/** Saves a payment receipt HTML file linked to a collection; optionally emails / WhatsApp. */
export async function persistCollectionReceipt(
  supabase: SupabaseClient,
  bookingId: string,
  collection: CollectionReceiptContext,
  opts?: { notify?: boolean }
): Promise<
  | { ok: true; id: string; notify?: NotifyBookingDocumentResponse }
  | { ok: false; error: string }
> {
  const packRes = await loadBookingPrintPack(supabase, bookingId);
  if (!packRes.ok) return { ok: false, error: packRes.error };

  const persisted = await persistGeneratedBookingDocument(supabase, packRes.pack, 'receipt', {
    linkId: collection.collectionId,
    htmlOverrides: {
      receivedAmount: collection.receivedAmount,
      receivedAt: collection.receivedAt,
      paymentMode: collection.mode,
      paymentReference: collection.reference,
      instalmentLabel: collection.instalmentLabel
    }
  });

  if (!persisted.ok) return { ok: false, error: persisted.error };

  if (opts?.notify === false) {
    return { ok: true, id: persisted.id };
  }

  const notify = await notifyGeneratedBookingDocument(bookingId, persisted.id);
  return { ok: true, id: persisted.id, notify };
}
