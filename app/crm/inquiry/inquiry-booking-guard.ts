import type { SupabaseClient } from '@supabase/supabase-js';
import { isUnitTokenReceivedStatus } from '../inventory/unit-status';

export const INQUIRY_ACTIVE_BOOKING_MESSAGE =
  'A booking already exists for this enquiry. Open the existing booking to continue.';

export const INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE =
  'This unit has token received in inventory. Enquiry pipeline stages are view-only — continue from the booking.';

export type ActiveInquiryBooking = {
  id: string;
  workflow_stage?: string | null;
};

/** Latest non-cancelled booking linked to an enquiry, if any. */
export async function fetchActiveBookingForInquiry(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<ActiveInquiryBooking | null> {
  const id = String(inquiryId || '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, workflow_stage')
    .eq('sales_inquiry_id', id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    workflow_stage: (data.workflow_stage as string | null) ?? null
  };
}

/** Negotiation cannot be reopened after a booking exists for the enquiry. */
export function inquiryNegotiationStageLocked(
  stage: string,
  hasActiveBooking: boolean
): boolean {
  return hasActiveBooking && String(stage || '').trim() === 'Negotiation';
}

/** All enquiry funnel stages are read-only when inventory is already on token. */
export function inquiryStagesLockedByUnitToken(
  unitStatus: string | null | undefined
): boolean {
  return isUnitTokenReceivedStatus(unitStatus);
}
