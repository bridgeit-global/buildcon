import { describe, expect, it } from 'vitest';
import {
  bookingCreateSchema,
  bookingQuickCustomerSchema
} from './booking-create.schema';

describe('bookingQuickCustomerSchema', () => {
  const valid = { full_name: 'Ravi Kumar', phone: '9876543210', email: '' };

  it('accepts minimal valid payload', () => {
    expect(bookingQuickCustomerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      bookingQuickCustomerSchema.safeParse({ ...valid, full_name: '' }).success
    ).toBe(false);
  });

  it('rejects invalid phone', () => {
    expect(
      bookingQuickCustomerSchema.safeParse({ ...valid, phone: '99' }).success
    ).toBe(false);
  });
});

describe('bookingCreateSchema', () => {
  const valid = {
    unitId: 'unit-1',
    customerId: 'cust-1',
    paymentMode: 'Cash',
    loanBank: '',
    upiUtr: '',
    chequeNo: '',
    neftRef: '',
    bookingAmount: '100000'
  };

  it('accepts minimal valid payload', () => {
    expect(bookingCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing unit', () => {
    expect(
      bookingCreateSchema.safeParse({ ...valid, unitId: '' }).success
    ).toBe(false);
  });

  it('requires loan bank for Home Loan', () => {
    const result = bookingCreateSchema.safeParse({
      ...valid,
      paymentMode: 'Home Loan',
      loanBank: ''
    });
    expect(result.success).toBe(false);
  });

  it('requires UPI UTR for UPI mode', () => {
    const result = bookingCreateSchema.safeParse({
      ...valid,
      paymentMode: 'UPI',
      upiUtr: ''
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid payment mode', () => {
    const result = bookingCreateSchema.safeParse({
      ...valid,
      paymentMode: 'InvalidMode'
    });
    expect(result.success).toBe(false);
  });

  it('accepts UPI with UTR', () => {
    const result = bookingCreateSchema.safeParse({
      ...valid,
      paymentMode: 'UPI',
      upiUtr: 'UTR123456'
    });
    expect(result.success).toBe(true);
  });
});
