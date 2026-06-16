import { describe, expect, it } from 'vitest';
import {
  buildFinancialTotalDisplayRows,
  formatBookingAmountInr,
  negotiatedPriceFromInquiryStage,
  resolveBookingFinancialTotal
} from './booking-financial-total';

describe('formatBookingAmountInr', () => {
  it('returns em dash for non-positive or non-finite amounts', () => {
    expect(formatBookingAmountInr(0)).toBe('—');
    expect(formatBookingAmountInr(-100)).toBe('—');
    expect(formatBookingAmountInr(NaN)).toBe('—');
    expect(formatBookingAmountInr(Infinity)).toBe('—');
  });

  it('formats positive amounts with compact and full INR', () => {
    const result = formatBookingAmountInr(5000000);
    expect(result).toContain('₹ 50.00 Lac');
    expect(result).toContain('₹ 50,00,000');
  });
});

describe('negotiatedPriceFromInquiryStage', () => {
  it('returns null for invalid stage data', () => {
    expect(negotiatedPriceFromInquiryStage(null)).toBeNull();
    expect(negotiatedPriceFromInquiryStage(undefined)).toBeNull();
    expect(negotiatedPriceFromInquiryStage([])).toBeNull();
    expect(negotiatedPriceFromInquiryStage({})).toBeNull();
    expect(negotiatedPriceFromInquiryStage({ negotiation: null })).toBeNull();
  });

  it('returns null for invalid offered price', () => {
    expect(
      negotiatedPriceFromInquiryStage({
        negotiation: { offered_price: '' }
      })
    ).toBeNull();
    expect(
      negotiatedPriceFromInquiryStage({
        negotiation: { offered_price: '0' }
      })
    ).toBeNull();
    expect(
      negotiatedPriceFromInquiryStage({
        negotiation: { offered_price: '-100' }
      })
    ).toBeNull();
  });

  it('returns rounded offered price when valid', () => {
    expect(
      negotiatedPriceFromInquiryStage({
        negotiation: { offered_price: '4750000.8' }
      })
    ).toBe(4750001);
    expect(
      negotiatedPriceFromInquiryStage({
        negotiation: { offered_price: ' 4500000 ' }
      })
    ).toBe(4500000);
  });
});

describe('resolveBookingFinancialTotal', () => {
  it('returns catalog total when no negotiation', () => {
    const result = resolveBookingFinancialTotal(5000000, null);
    expect(result).toEqual({
      catalogTotalInr: 5000000,
      negotiatedPriceInr: null,
      discountInr: null,
      discountPct: null,
      financialTotalInr: 5000000
    });
  });

  it('computes discount when negotiated price is lower', () => {
    const result = resolveBookingFinancialTotal(5000000, 4500000);
    expect(result.catalogTotalInr).toBe(5000000);
    expect(result.negotiatedPriceInr).toBe(4500000);
    expect(result.discountInr).toBe(500000);
    expect(result.discountPct).toBe(10);
    expect(result.financialTotalInr).toBe(4500000);
  });

  it('clamps negative catalog and ignores invalid negotiation', () => {
    const result = resolveBookingFinancialTotal(-100, 'abc');
    expect(result.catalogTotalInr).toBe(0);
    expect(result.negotiatedPriceInr).toBeNull();
    expect(result.financialTotalInr).toBe(0);
  });

  it('ignores zero or negative negotiated price', () => {
    const result = resolveBookingFinancialTotal(5000000, 0);
    expect(result.negotiatedPriceInr).toBeNull();
    expect(result.financialTotalInr).toBe(5000000);
  });
});

describe('buildFinancialTotalDisplayRows', () => {
  it('returns empty array when no negotiated price', () => {
    expect(
      buildFinancialTotalDisplayRows({
        catalogTotalInr: 5000000,
        negotiatedPriceInr: null,
        discountInr: null,
        discountPct: null,
        financialTotalInr: 5000000
      })
    ).toEqual([]);
  });

  it('builds display rows with discount when negotiated', () => {
    const rows = buildFinancialTotalDisplayRows({
      catalogTotalInr: 5000000,
      negotiatedPriceInr: 4500000,
      discountInr: 500000,
      discountPct: 10,
      financialTotalInr: 4500000
    });

    expect(rows.length).toBe(3);
    expect(rows[0][0]).toBe('Catalog total (est.)');
    expect(rows[1][0]).toBe('Negotiation discount');
    expect(rows[1][1]).toContain('5.00 Lac');
    expect(rows[1][1]).toContain('(10%)');
    expect(rows[2][0]).toBe('Financial total (agreed)');
  });

  it('omits discount row when discount is zero', () => {
    const rows = buildFinancialTotalDisplayRows({
      catalogTotalInr: 5000000,
      negotiatedPriceInr: 5000000,
      discountInr: 0,
      discountPct: 0,
      financialTotalInr: 5000000
    });

    expect(rows.length).toBe(2);
    expect(rows.some((r) => r[0] === 'Negotiation discount')).toBe(false);
  });
});
