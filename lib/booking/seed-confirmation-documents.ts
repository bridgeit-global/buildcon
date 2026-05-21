import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import { generatedReceiptExistsForCollection } from '@/lib/booking/booking-generated-doc-kind';
import { dispatchGeneratedDocumentNotification } from '@/lib/notifications/dispatch-notification';

export type SeedConfirmationDocumentsResult = {
  tokenReceiptCreated: boolean;
  tokenReceiptSkipped: boolean;
  notified?: boolean;
  notifyError?: string;
  error?: string;
};

/** Idempotent: PDF receipt for token collection posted at confirmation. */
export async function seedConfirmationDocuments(
  admin: SupabaseClient,
  bookingId: string,
  opts?: { generatedBy?: string | null }
): Promise<SeedConfirmationDocumentsResult> {
  const packRes = await loadBookingPrintPack(admin, bookingId);
  if (!packRes.ok) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: false, error: packRes.error };
  }

  const { data: schedule } = await admin
    .from('payment_schedules')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('instalment_no', 1)
    .maybeSingle();

  if (!schedule?.id) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: true };
  }

  const scheduleId = schedule.id as string;

  const { data: collections, error: cErr } = await admin
    .from('collections')
    .select('id,received_amount,received_at,mode,reference')
    .eq('booking_id', bookingId)
    .eq('schedule_id', scheduleId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (cErr) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: false, error: cErr.message };
  }

  const collection = collections?.[0];
  if (!collection?.id) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: true };
  }

  const { data: existing } = await admin
    .from('generated_documents')
    .select('storage_path')
    .eq('booking_id', bookingId)
    .limit(200);

  if (
    generatedReceiptExistsForCollection(
      (existing ?? []) as { storage_path: string }[],
      collection.id as string
    )
  ) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: true };
  }

  const { data: schedRow } = await admin
    .from('payment_schedules')
    .select('instalment_no,milestone')
    .eq('id', scheduleId)
    .maybeSingle();

  const instalmentLabel = schedRow
    ? `${schedRow.instalment_no}. ${schedRow.milestone}`
    : 'Booking Amount';

  const persisted = await persistGeneratedBookingDocumentServer(
    admin,
    packRes.pack,
    'receipt',
    {
      linkId: collection.id as string,
      generatedBy: opts?.generatedBy ?? null,
      htmlOverrides: {
        receivedAmount: Number(collection.received_amount || 0),
        receivedAt: (collection.received_at as string | null) ?? null,
        paymentMode: (collection.mode as string | null) ?? null,
        paymentReference: (collection.reference as string | null) ?? null,
        instalmentLabel
      }
    }
  );

  if (!persisted.ok) {
    return { tokenReceiptCreated: false, tokenReceiptSkipped: false, error: persisted.error };
  }

  const notify = await dispatchGeneratedDocumentNotification(admin, persisted.id);

  return {
    tokenReceiptCreated: true,
    tokenReceiptSkipped: false,
    notified: notify.ok,
    notifyError: notify.error
  };
}
