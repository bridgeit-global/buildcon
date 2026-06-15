import {
  toastDocumentDeliveryResults,
  type NotifyBookingDocumentResponse
} from '@/lib/booking/notify-booking-document';
import { pageError } from '@/lib/toast';
import { userFacingError } from '@/lib/utils';

export type SendInquiryCostSheetBody = {
  unitId: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  preferShareLink?: boolean;
};

/** Browser: POST to send inquiry cost sheet to the customer (email, SMS, WhatsApp). */
export async function sendInquiryCostSheet(
  inquiryId: string,
  body: SendInquiryCostSheetBody
): Promise<NotifyBookingDocumentResponse> {
  const res = await fetch(
    `/api/crm/inquiries/${encodeURIComponent(inquiryId)}/cost-sheet/send`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  let json: NotifyBookingDocumentResponse;
  try {
    json = (await res.json()) as NotifyBookingDocumentResponse;
  } catch {
    return { ok: false, error: 'Cost sheet send response was invalid.' };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: userFacingError(
        typeof json.error === 'string' ? json.error : null,
        'Sending the cost sheet failed.'
      )
    };
  }

  return json;
}

export async function sendInquiryCostSheetWithToasts(
  inquiryId: string,
  body: SendInquiryCostSheetBody
): Promise<boolean> {
  const result = await sendInquiryCostSheet(inquiryId, body);
  if (
    !result.ok &&
    result.error &&
    !result.emailSent &&
    !result.smsSent &&
    !result.whatsappSent &&
    !result.whatsappUrl
  ) {
    pageError(result.error);
    return false;
  }
  toastDocumentDeliveryResults(result, {
    lead: result.ok ? 'Cost sheet sent to customer.' : undefined
  });
  return result.ok;
}
