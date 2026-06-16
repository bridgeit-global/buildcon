import { describe, expect, it } from 'vitest';
import {
  bookingAllotmentSchema,
  bookingApplicationSchema,
  bookingBuyerKycSchema,
  bookingCancelSchema,
  bookingTokenStageSchema,
  parseBookingBuyerAadhaarInlineError,
  parseBookingBuyerKycFieldErrors,
  parseBookingBuyerPanInlineError
} from './booking-workflow.schema';

describe('bookingTokenStageSchema', () => {
  const valid = { amount: '50000', date: '2026-06-01', mode: 'Cash' };

  it('accepts minimal valid payload', () => {
    expect(bookingTokenStageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-positive amount', () => {
    expect(
      bookingTokenStageSchema.safeParse({ ...valid, amount: '0' }).success
    ).toBe(false);
  });

  it('rejects loan payment mode without loan bank on booking', () => {
    const result = bookingTokenStageSchema.safeParse({
      ...valid,
      mode: 'Home Loan'
    });
    expect(result.success).toBe(false);
  });
});

describe('bookingApplicationSchema', () => {
  it('accepts minimal valid payload', () => {
    expect(
      bookingApplicationSchema.safeParse({
        occupation: 'Engineer',
        address_line1: '12 Main St'
      }).success
    ).toBe(true);
  });

  it('rejects empty address', () => {
    expect(
      bookingApplicationSchema.safeParse({
        occupation: '',
        address_line1: ''
      }).success
    ).toBe(false);
  });
});

describe('bookingAllotmentSchema', () => {
  it('accepts allotment date', () => {
    expect(
      bookingAllotmentSchema.safeParse({ allotment_date: '2026-06-15' }).success
    ).toBe(true);
  });

  it('rejects missing allotment date', () => {
    expect(
      bookingAllotmentSchema.safeParse({ allotment_date: '' }).success
    ).toBe(false);
  });
});

describe('bookingBuyerKycSchema', () => {
  const valid = { pan_number: 'ABCDE1234F', aadhaar_last4: '123456789012' };

  it('accepts valid PAN and Aadhaar', () => {
    expect(bookingBuyerKycSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid PAN', () => {
    expect(
      bookingBuyerKycSchema.safeParse({ ...valid, pan_number: 'INVALID' }).success
    ).toBe(false);
  });

  it('rejects short Aadhaar', () => {
    expect(
      bookingBuyerKycSchema.safeParse({ ...valid, aadhaar_last4: '1234' }).success
    ).toBe(false);
  });
});

describe('parseBookingBuyerKycFieldErrors', () => {
  it('returns null for valid values', () => {
    expect(
      parseBookingBuyerKycFieldErrors({
        pan_number: 'ABCDE1234F',
        aadhaar_last4: '123456789012'
      })
    ).toBeNull();
  });

  it('returns field errors for invalid values', () => {
    const errors = parseBookingBuyerKycFieldErrors({
      pan_number: '',
      aadhaar_last4: ''
    });
    expect(errors?.pan).toBeTruthy();
    expect(errors?.aadhaar).toBeTruthy();
  });
});

describe('parseBookingBuyerPanInlineError', () => {
  it('returns undefined for valid PAN', () => {
    expect(parseBookingBuyerPanInlineError('ABCDE1234F')).toBeUndefined();
  });

  it('returns error for incomplete PAN', () => {
    expect(parseBookingBuyerPanInlineError('ABCDE')).toBeTruthy();
  });
});

describe('parseBookingBuyerAadhaarInlineError', () => {
  it('returns undefined for 12 digits', () => {
    expect(parseBookingBuyerAadhaarInlineError('123456789012')).toBeUndefined();
  });

  it('returns error when too short', () => {
    expect(parseBookingBuyerAadhaarInlineError('1234')).toBeTruthy();
  });
});

describe('bookingCancelSchema', () => {
  it('accepts cancel reason', () => {
    expect(
      bookingCancelSchema.safeParse({ cancelReason: 'Customer withdrew' }).success
    ).toBe(true);
  });

  it('rejects empty cancel reason', () => {
    expect(bookingCancelSchema.safeParse({ cancelReason: '' }).success).toBe(
      false
    );
  });
});
