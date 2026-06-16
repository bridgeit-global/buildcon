import { describe, expect, it } from 'vitest';
import {
  isNegotiationDiscountOverCap,
  MAX_NEGOTIATION_DISCOUNT_PCT,
  negotiationFormLocked,
  negotiationRequiresApproval,
  offeredPriceFromNegotiation,
  resolveNegotiationDiscount,
  syncNegotiationDiscountFields
} from './negotiation-discount';

describe('MAX_NEGOTIATION_DISCOUNT_PCT', () => {
  it('is 50', () => {
    expect(MAX_NEGOTIATION_DISCOUNT_PCT).toBe(50);
  });
});

describe('resolveNegotiationDiscount', () => {
  it('returns nulls when list price is invalid', () => {
    expect(resolveNegotiationDiscount(null, {})).toEqual({
      discountInr: null,
      discountPct: null,
      offeredPrice: null
    });
    expect(resolveNegotiationDiscount(0, {})).toEqual({
      discountInr: null,
      discountPct: null,
      offeredPrice: null
    });
  });

  it('returns list price as offered when no discount input', () => {
    expect(resolveNegotiationDiscount(1000000, {})).toEqual({
      discountInr: null,
      discountPct: null,
      offeredPrice: 1000000
    });
  });

  it('resolves from discount INR', () => {
    const result = resolveNegotiationDiscount(1000000, { discountInrRaw: '100000' });
    expect(result.discountInr).toBe(100000);
    expect(result.discountPct).toBe(10);
    expect(result.offeredPrice).toBe(900000);
  });

  it('caps discount INR at list price', () => {
    const result = resolveNegotiationDiscount(1000000, { discountInrRaw: 2000000 });
    expect(result.discountInr).toBe(1000000);
    expect(result.discountPct).toBe(100);
    expect(result.offeredPrice).toBe(0);
  });

  it('resolves from discount percent when INR not set', () => {
    const result = resolveNegotiationDiscount(1000000, { discountPctRaw: '15' });
    expect(result.discountInr).toBe(150000);
    expect(result.discountPct).toBe(15);
    expect(result.offeredPrice).toBe(850000);
  });

  it('caps discount percent at 100', () => {
    const result = resolveNegotiationDiscount(1000000, { discountPctRaw: 150 });
    expect(result.discountPct).toBe(100);
    expect(result.offeredPrice).toBe(0);
  });

  it('prefers INR over percent when both provided', () => {
    const result = resolveNegotiationDiscount(1000000, {
      discountInrRaw: '50000',
      discountPctRaw: '20'
    });
    expect(result.discountInr).toBe(50000);
    expect(result.discountPct).toBe(5);
  });

  it('parses comma-separated INR strings', () => {
    const result = resolveNegotiationDiscount(1000000, {
      discountInrRaw: '1,00,000'
    });
    expect(result.discountInr).toBe(100000);
  });
});

describe('isNegotiationDiscountOverCap', () => {
  it('returns false when discount is within cap', () => {
    expect(
      isNegotiationDiscountOverCap(1000000, { discountPctRaw: '40' })
    ).toBe(false);
  });

  it('returns true when discount exceeds cap', () => {
    expect(
      isNegotiationDiscountOverCap(1000000, { discountPctRaw: '60' })
    ).toBe(true);
  });

  it('returns false when no discount', () => {
    expect(isNegotiationDiscountOverCap(1000000, {})).toBe(false);
  });
});

describe('negotiationRequiresApproval', () => {
  it('returns false for invalid negotiation', () => {
    expect(negotiationRequiresApproval(1000000, null)).toBe(false);
    expect(negotiationRequiresApproval(1000000, [])).toBe(false);
  });

  it('returns true when offered price set without valid list price', () => {
    expect(
      negotiationRequiresApproval(null, { offered_price: '900000' })
    ).toBe(true);
  });

  it('returns true when discount fields present', () => {
    expect(
      negotiationRequiresApproval(1000000, { discount_inr: '50000' })
    ).toBe(true);
  });

  it('returns true when offered price below list', () => {
    expect(
      negotiationRequiresApproval(1000000, { offered_price: '900000' })
    ).toBe(true);
  });

  it('returns false when offered equals list with no discount', () => {
    expect(
      negotiationRequiresApproval(1000000, { offered_price: '1000000' })
    ).toBe(false);
  });
});

describe('offeredPriceFromNegotiation', () => {
  it('returns resolved offered price from discount fields', () => {
    expect(
      offeredPriceFromNegotiation(1000000, { discount_inr: '100000' })
    ).toBe('900000');
  });

  it('falls back to legacy offered_price string', () => {
    expect(
      offeredPriceFromNegotiation(null, { offered_price: '875000' })
    ).toBe('875000');
  });

  it('returns list price when no negotiation discount', () => {
    expect(offeredPriceFromNegotiation(1000000, {})).toBe('1000000');
  });

  it('returns empty string when nothing available', () => {
    expect(offeredPriceFromNegotiation(null, null)).toBe('');
  });
});

describe('syncNegotiationDiscountFields', () => {
  it('syncs discount_inr, discount_pct, and offered_price', () => {
    const result = syncNegotiationDiscountFields(1000000, {
      discount_inr: '100000',
      notes: 'test'
    });
    expect(result.discount_inr).toBe('100000');
    expect(result.discount_pct).toBe('10');
    expect(result.offered_price).toBe('900000');
    expect(result.notes).toBe('test');
  });

  it('uses list price as offered when no discount fields are set', () => {
    const result = syncNegotiationDiscountFields(1000000, {
      offered_price: '950000'
    });
    expect(result.offered_price).toBe('1000000');
  });

  it('falls back to negotiation offered_price when list price is invalid', () => {
    const result = syncNegotiationDiscountFields(null, {
      offered_price: '950000'
    });
    expect(result.offered_price).toBe('950000');
  });
});

describe('negotiationFormLocked', () => {
  it('returns false for invalid negotiation', () => {
    expect(negotiationFormLocked(null)).toBe(false);
    expect(negotiationFormLocked(undefined)).toBe(false);
    expect(negotiationFormLocked([])).toBe(false);
  });

  it('returns true when approval_status is approved or pending', () => {
    expect(negotiationFormLocked({ approval_status: 'approved' })).toBe(true);
    expect(negotiationFormLocked({ approval_status: 'Pending' })).toBe(true);
    expect(negotiationFormLocked({ approval_status: ' APPROVED ' })).toBe(true);
  });

  it('returns false for other statuses', () => {
    expect(negotiationFormLocked({ approval_status: 'rejected' })).toBe(false);
    expect(negotiationFormLocked({ approval_status: '' })).toBe(false);
  });
});
