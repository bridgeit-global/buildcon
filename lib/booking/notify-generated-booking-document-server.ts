import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dispatchGeneratedDocumentNotification,
  type DispatchNotificationResult
} from '@/lib/notifications/dispatch-notification';
import type { NotifyBookingDocumentResponse } from '@/lib/booking/notify-booking-document';

export function toNotifyBookingDocumentResponse(
  result: DispatchNotificationResult
): NotifyBookingDocumentResponse {
  return {
    ok: result.ok,
    docLabel: result.docLabel,
    emailSent: result.email.status === 'sent',
    emailSkippedReason:
      result.email.status === 'skipped'
        ? result.email.skippedReason ?? undefined
        : result.email.status === 'failed'
          ? (result.email.error ?? undefined)
          : undefined,
    whatsappSent: result.whatsapp.status === 'sent',
    whatsappSkippedReason:
      result.whatsapp.status === 'skipped'
        ? result.whatsapp.skippedReason ?? undefined
        : result.whatsapp.status === 'failed'
          ? (result.whatsapp.error ?? undefined)
          : undefined,
    whatsappUrl: result.whatsapp.fallbackShareUrl,
    error: result.error
  };
}

/** Server-side notify (email + WhatsApp) after auth on the caller route. */
export async function notifyGeneratedBookingDocumentServer(
  admin: SupabaseClient,
  bookingId: string,
  generatedDocumentId: string,
  opts?: { preferShareLink?: boolean }
): Promise<NotifyBookingDocumentResponse | { ok: false; error: string }> {
  const { data: genRow, error: genErr } = await admin
    .from('generated_documents')
    .select('id,booking_id')
    .eq('id', generatedDocumentId)
    .maybeSingle();

  if (genErr) {
    return { ok: false, error: genErr.message };
  }
  if (!genRow || genRow.booking_id !== bookingId) {
    return { ok: false, error: 'Document not found for this booking' };
  }

  const result = await dispatchGeneratedDocumentNotification(admin, generatedDocumentId, {
    preferShareLink: opts?.preferShareLink === true
  });

  return toNotifyBookingDocumentResponse(result);
}
