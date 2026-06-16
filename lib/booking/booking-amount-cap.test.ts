import { describe, expect, it } from 'vitest';
import { bookingAmountExceedsUnitTotalMessage } from './booking-amount-cap';

describe('bookingAmountExceedsUnitTotalMessage', () => {
  it('returns null when unit total is zero or negative', () => {
    expect(bookingAmountExceedsUnitTotalMessage(100000, 0)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage(100000, -100)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage(100000, null as unknown as number)).toBeNull();
  });

  it('returns null when booking amount is zero, negative, or non-finite', () => {
    expect(bookingAmountExceedsUnitTotalMessage(0, 5000000)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage(-100, 5000000)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage(NaN, 5000000)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage('abc' as unknown as number, 5000000)).toBeNull();
  });

  it('returns null when booking amount is within unit total', () => {
    expect(bookingAmountExceedsUnitTotalMessage(100000, 5000000)).toBeNull();
    expect(bookingAmountExceedsUnitTotalMessage(5000000, 5000000)).toBeNull();
  });

  it('returns error message when booking exceeds unit total', () => {
    const msg = bookingAmountExceedsUnitTotalMessage(6000000, 5000000);
    expect(msg).toBe(
      'Booking amount cannot exceed unit total (₹ 50,00,000).'
    );
  });

  it('rounds amounts before comparison', () => {
    expect(
      bookingAmountExceedsUnitTotalMessage(5000000.4, 5000000.6)
    ).toBeNull();
    expect(
      bookingAmountExceedsUnitTotalMessage(5000001, 5000000.4)
    ).toContain('50,00,000');
  });
});
