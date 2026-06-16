import { describe, expect, it } from 'vitest';
import {
  inquiryCloseSchema,
  negotiationApprovalRequestSchema,
  negotiationDiscountApprovalSchema,
  negotiationDiscountApprovalSchemaWithUnitCap,
  negotiationOfferSchema
} from './inquiry-pipeline.schema';

describe('negotiationDiscountApprovalSchema', () => {
  it('accepts minimal payload', () => {
    expect(
      negotiationDiscountApprovalSchema.safeParse({
        discountInr: '10000',
        discountPct: '',
        requestNote: ''
      }).success
    ).toBe(true);
  });
});

describe('negotiationDiscountApprovalSchemaWithUnitCap', () => {
  const base = { discountInr: '', discountPct: '10', requestNote: 'Please approve' };

  it('accepts discount within cap', () => {
    const schema = negotiationDiscountApprovalSchemaWithUnitCap(1_000_000, 'pct');
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('rejects zero discount', () => {
    const schema = negotiationDiscountApprovalSchemaWithUnitCap(1_000_000, 'pct');
    const result = schema.safeParse({ ...base, discountPct: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects discount over 50%', () => {
    const schema = negotiationDiscountApprovalSchemaWithUnitCap(1_000_000, 'pct');
    const result = schema.safeParse({ ...base, discountPct: '60' });
    expect(result.success).toBe(false);
  });

  it('rejects INR discount above list price', () => {
    const schema = negotiationDiscountApprovalSchemaWithUnitCap(100_000, 'inr');
    const result = schema.safeParse({
      discountInr: '150000',
      discountPct: '',
      requestNote: ''
    });
    expect(result.success).toBe(false);
  });
});

describe('negotiationOfferSchema', () => {
  it('accepts positive offered price', () => {
    expect(
      negotiationOfferSchema.safeParse({ offeredPrice: '5000000' }).success
    ).toBe(true);
  });

  it('rejects non-positive offered price', () => {
    expect(
      negotiationOfferSchema.safeParse({ offeredPrice: '0' }).success
    ).toBe(false);
  });
});

describe('negotiationApprovalRequestSchema', () => {
  it('accepts valid request', () => {
    expect(
      negotiationApprovalRequestSchema.safeParse({
        offeredPrice: '4500000',
        requestNote: 'Customer request'
      }).success
    ).toBe(true);
  });

  it('rejects invalid offered price', () => {
    expect(
      negotiationApprovalRequestSchema.safeParse({
        offeredPrice: '',
        requestNote: ''
      }).success
    ).toBe(false);
  });
});

describe('inquiryCloseSchema', () => {
  it('accepts close reason', () => {
    expect(
      inquiryCloseSchema.safeParse({ closeReason: 'Not interested' }).success
    ).toBe(true);
  });

  it('rejects empty close reason', () => {
    expect(inquiryCloseSchema.safeParse({ closeReason: '' }).success).toBe(false);
  });
});
