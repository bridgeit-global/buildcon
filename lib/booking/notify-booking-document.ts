export type NotifyBookingDocumentResponse = {
  ok: boolean;
  docLabel?: string;
  emailSent?: boolean;
  emailSkippedReason?: string;
  whatsappUrl?: string | null;
  whatsappSkippedReason?: string;
  error?: string;
};

/** Calls the CRM notify API (email via Resend + WhatsApp deep link when configured). */
export async function notifyGeneratedBookingDocument(
  bookingId: string,
  generatedDocumentId: string
): Promise<NotifyBookingDocumentResponse> {
  const res = await fetch(
    `/api/crm/bookings/${encodeURIComponent(bookingId)}/documents/notify`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedDocumentId })
    }
  );

  let notify: NotifyBookingDocumentResponse;
  try {
    notify = (await res.json()) as NotifyBookingDocumentResponse;
  } catch {
    return {
      ok: false,
      error: 'Customer notification response was invalid.'
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof notify.error === 'string'
          ? notify.error
          : 'Notifying the customer failed.'
    };
  }

  return notify;
}

/** Builds user-facing banner text after save + optional notify (opens WhatsApp when URL returned). */
export function formatDocumentDeliveryNotice(
  lead: string,
  notify: NotifyBookingDocumentResponse | undefined,
  opts?: { openWhatsApp?: boolean }
): string {
  const bits: string[] = [lead];
  if (!notify) return lead;

  if (notify.emailSent) bits.push('Customer email sent.');
  if (notify.emailSkippedReason) bits.push(`Email: ${notify.emailSkippedReason}`);
  if (notify.whatsappUrl) {
    if (opts?.openWhatsApp !== false) {
      window.open(notify.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
    bits.push(
      'WhatsApp opened with a prefilled message — press Send to deliver to the customer.'
    );
  } else if (notify.whatsappSkippedReason) {
    bits.push(`WhatsApp: ${notify.whatsappSkippedReason}`);
  }
  if (!notify.ok && notify.error) {
    bits.push(`Notification: ${notify.error}`);
  }

  return bits.join(' ');
}
