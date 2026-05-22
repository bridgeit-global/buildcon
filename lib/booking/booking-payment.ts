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

export function paymentModeNeedsLoanBank(mode: string | null | undefined) {
  const m = String(mode || '').trim();
  return m === 'Home Loan' || m === 'Construction Linked';
}
