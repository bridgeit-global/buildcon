import { toast } from '@/lib/toast';

export type NotifyBookingDocumentResponse = {
  ok: boolean;
  docLabel?: string;
  emailSent?: boolean;
  emailSkippedReason?: string;
  smsSent?: boolean;
  smsSkippedReason?: string;
  whatsappSent?: boolean;
  whatsappSkippedReason?: string;
  whatsappUrl?: string | null;
  error?: string;
};

/** Browser-only: calls the CRM notify API (use `notifyGeneratedBookingDocumentServer` in API routes). */
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

/** Builds user-facing banner text after save + optional notify. */
export function formatDocumentDeliveryNotice(
  lead: string,
  notify: NotifyBookingDocumentResponse | undefined,
  opts?: { openWhatsApp?: boolean }
): string {
  const bits: string[] = [lead];
  if (!notify) return lead;

  if (notify.emailSent) bits.push('Customer email sent.');
  if (notify.emailSkippedReason) bits.push(`Email: ${notify.emailSkippedReason}`);

  if (notify.smsSent) bits.push('Customer SMS sent.');
  if (notify.smsSkippedReason) bits.push(`SMS: ${notify.smsSkippedReason}`);

  if (notify.whatsappSent) {
    bits.push('WhatsApp message sent to the customer.');
  } else if (notify.whatsappUrl) {
    if (opts?.openWhatsApp !== false && typeof window !== 'undefined') {
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

/** Per-channel success / skip / failure toasts (replaces a single combined banner). */
export function toastDocumentDeliveryResults(
  notify: NotifyBookingDocumentResponse,
  opts?: { lead?: string; openWhatsApp?: boolean }
): void {
  const lead = opts?.lead?.trim();
  if (lead) {
    toast.success(lead);
  }

  if (notify.emailSent) {
    toast.success('Email sent successfully');
  } else if (notify.emailSkippedReason) {
    toast.error({ title: 'Email not sent', description: notify.emailSkippedReason });
  }

  if (notify.smsSent) {
    toast.success('SMS sent successfully');
  } else if (notify.smsSkippedReason) {
    toast.error({ title: 'SMS not sent', description: notify.smsSkippedReason });
  }

  if (notify.whatsappSent) {
    toast.success('WhatsApp sent successfully');
  } else if (notify.whatsappUrl) {
    if (opts?.openWhatsApp !== false && typeof window !== 'undefined') {
      window.open(notify.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
    toast.info({
      title: 'WhatsApp opened',
      description:
        'Prefilled message opened — press Send in WhatsApp to deliver to the customer.'
    });
  } else if (notify.whatsappSkippedReason) {
    toast.error({ title: 'WhatsApp not sent', description: notify.whatsappSkippedReason });
  }

  if (!notify.ok && notify.error) {
    toast.error(notify.error);
  }
}
