import { describe, expect, it } from 'vitest';
import {
  BOOKING_PAYMENT_MODE_OPTIONS,
  paymentModeNeedsLoanBank
} from '@/lib/booking/booking-payment';

describe('BOOKING_PAYMENT_MODE_OPTIONS', () => {
  it('includes expected payment modes', () => {
    expect(BOOKING_PAYMENT_MODE_OPTIONS).toContain('UPI');
    expect(BOOKING_PAYMENT_MODE_OPTIONS).toContain('Home Loan');
    expect(BOOKING_PAYMENT_MODE_OPTIONS).toContain('Construction Linked');
  });
});

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
