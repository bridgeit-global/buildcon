import { z } from 'zod';

export const BOOKING_PAYMENT_MODE_OPTIONS = [
  'Cash',
  'UPI',
  'Cheque',
  'NEFT/RTGS',
  'Card',
  'Down Payment',
  'Home Loan',
  'Construction Linked'
] as const;

export type BookingPaymentMode = (typeof BOOKING_PAYMENT_MODE_OPTIONS)[number];

const BOOKING_PAYMENT_MODE_SET = new Set<string>(BOOKING_PAYMENT_MODE_OPTIONS);

export function isBookingPaymentMode(
  mode: string | null | undefined
): mode is BookingPaymentMode {
  const m = String(mode ?? '').trim();
  return BOOKING_PAYMENT_MODE_SET.has(m);
}

export function normalizeBookingPaymentMode(
  mode: string | null | undefined
): BookingPaymentMode | null {
  const m = String(mode ?? '').trim();
  return isBookingPaymentMode(m) ? m : null;
}

export const bookingPaymentModeField = z
  .string()
  .trim()
  .min(1, 'Select a payment mode.')
  .refine(isBookingPaymentMode, { message: 'Select a payment mode.' });

export function paymentModeNeedsLoanBank(mode: string | null | undefined) {
  const m = String(mode || '').trim();
  return m === 'Home Loan' || m === 'Construction Linked';
}
