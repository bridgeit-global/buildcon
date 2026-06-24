import { describe, expect, it } from 'vitest';
import {
  isBookingPaymentMode,
  normalizeBookingPaymentMode,
  paymentModeNeedsLoanBank
} from '@/lib/booking/booking-payment';

describe('paymentModeNeedsLoanBank', () => {
  it('returns true for loan-linked modes', () => {
    expect(paymentModeNeedsLoanBank('Home Loan')).toBe(true);
    expect(paymentModeNeedsLoanBank('Construction Linked')).toBe(true);
  });

  it('returns false for other modes', () => {
    expect(paymentModeNeedsLoanBank('UPI')).toBe(false);
    expect(paymentModeNeedsLoanBank('Cash')).toBe(false);
  });

  it('handles whitespace and empty values', () => {
    expect(paymentModeNeedsLoanBank('  Home Loan  ')).toBe(true);
    expect(paymentModeNeedsLoanBank(null)).toBe(false);
    expect(paymentModeNeedsLoanBank('')).toBe(false);
  });
});

describe('isBookingPaymentMode', () => {
  it('accepts known payment modes', () => {
    expect(isBookingPaymentMode('UPI')).toBe(true);
    expect(isBookingPaymentMode('Construction Linked')).toBe(true);
  });

  it('rejects unknown or blank values', () => {
    expect(isBookingPaymentMode('InvalidMode')).toBe(false);
    expect(isBookingPaymentMode('')).toBe(false);
    expect(isBookingPaymentMode(null)).toBe(false);
  });
});

describe('normalizeBookingPaymentMode', () => {
  it('returns trimmed valid mode', () => {
    expect(normalizeBookingPaymentMode('  Cash  ')).toBe('Cash');
  });

  it('returns null for invalid mode', () => {
    expect(normalizeBookingPaymentMode('Wire Transfer')).toBeNull();
  });
});
