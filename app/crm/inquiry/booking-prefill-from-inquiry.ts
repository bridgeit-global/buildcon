import type { BookingPrefillV1 } from '../booking-prefill-storage';
import { negotiatedPriceFromInquiryStage } from '../booking-financial-total';
import { inquiryReference } from './inquiry-helpers';
import type { InquiryStageData } from './inquiry-types';

export type InquiryTokenStage = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
  recorded_at?: string;
};

const BOOKING_PAYMENT_MODES = new Set([
  'Cash',
  'UPI',
  'Cheque',
  'NEFT/RTGS',
  'Card',
  'Down Payment',
  'Home Loan',
  'Construction Linked'
]);

export function tokenStageFromInquiry(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): InquiryTokenStage {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return {};
  }
  const token = (stageData as InquiryStageData).token;
  if (!token || typeof token !== 'object' || Array.isArray(token)) return {};
  return token as InquiryTokenStage;
}

function normalizePaymentMode(mode: string | undefined): string | null {
  const m = String(mode ?? '').trim();
  if (!m || !BOOKING_PAYMENT_MODES.has(m)) return null;
  return m;
}

export type BuildBookingPrefillInput = {
  inquiryId: string;
  projectId: string;
  customerId: string;
  unitId: string;
  stageData?: InquiryStageData | Record<string, unknown> | null;
  parkingRequired?: 'Yes' | 'No';
  parkingCount?: string;
  parkingSlotsAvailable?: number | null;
  parkingRateSnapshot?: number | null;
};

/** Session prefill for `/crm/bookings` from an enquiry (token fields when present). */
export function buildBookingPrefillFromInquiry(
  input: BuildBookingPrefillInput
): Omit<BookingPrefillV1, 'version'> {
  const token = tokenStageFromInquiry(input.stageData);
  const amount = String(token.amount ?? '').trim();
  const negotiatedPriceInr = negotiatedPriceFromInquiryStage(input.stageData);

  return {
    projectId: String(input.projectId || '').trim(),
    inquiryId: input.inquiryId,
    inquiryRef: inquiryReference(input.inquiryId),
    customerId: input.customerId,
    unitId: String(input.unitId || '').trim(),
    parkingRequired: input.parkingRequired ?? 'No',
    parkingCount: input.parkingCount ?? '1',
    parkingSlotsAvailable: input.parkingSlotsAvailable ?? null,
    parkingRateSnapshot: input.parkingRateSnapshot ?? null,
    bookingAmount: amount || null,
    tokenDate: String(token.date ?? '').trim() || null,
    paymentMode: normalizePaymentMode(token.mode),
    paymentReference: String(token.reference ?? '').trim() || null,
    negotiatedPriceInr
  };
}
