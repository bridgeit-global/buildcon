import { describe, expect, it } from 'vitest';
import {
  formatAgreementValueCompact,
  formatInr,
  formatInrCompactLacCr,
  formatUnitAgreementValueCompact,
  unitAgreementTotalInr,
  unitBaseAgreementInr,
  unitBillableAreaSqft,
  type UnitPricingInput
} from './inr-format';

describe('formatInr', () => {
  it('returns em dash for null, undefined, NaN, Infinity', () => {
    expect(formatInr(null)).toBe('—');
    expect(formatInr(undefined)).toBe('—');
    expect(formatInr(NaN)).toBe('—');
    expect(formatInr(Infinity)).toBe('—');
    expect(formatInr(-Infinity)).toBe('—');
  });

  it('formats with Indian digit grouping', () => {
    expect(formatInr(1234567)).toBe('12,34,567');
    expect(formatInr(0)).toBe('0');
    expect(formatInr(1234.56)).toBe('1,234.56');
  });

  it('merges custom Intl options', () => {
    expect(formatInr(1234.5, { minimumFractionDigits: 2 })).toBe('1,234.50');
  });
});

describe('formatInrCompactLacCr', () => {
  it('returns em dash for non-finite values', () => {
    expect(formatInrCompactLacCr(undefined)).toBe('—');
    expect(formatInrCompactLacCr(NaN)).toBe('—');
    expect(formatInrCompactLacCr(Infinity)).toBe('—');
  });

  it('treats null as zero (Number(null) === 0)', () => {
    expect(formatInrCompactLacCr(null)).toBe('₹ 0');
  });

  it('formats zero', () => {
    expect(formatInrCompactLacCr(0)).toBe('₹ 0');
  });

  it('formats negative amounts with minus sign', () => {
    expect(formatInrCompactLacCr(-500000)).toBe('₹ −5.00 Lac');
    expect(formatInrCompactLacCr(-10000000)).toBe('₹ −1.00 Cr');
  });

  it('formats below 100 Lac as Lac', () => {
    expect(formatInrCompactLacCr(500000)).toBe('₹ 5.00 Lac');
    expect(formatInrCompactLacCr(9900000)).toBe('₹ 99.00 Lac');
  });

  it('formats 1 Cr and above as Cr', () => {
    expect(formatInrCompactLacCr(10000000)).toBe('₹ 1.00 Cr');
    expect(formatInrCompactLacCr(25000000)).toBe('₹ 2.50 Cr');
  });
});

describe('formatAgreementValueCompact', () => {
  it('multiplies area and rate then formats compact', () => {
    expect(formatAgreementValueCompact(1000, 5000)).toBe('₹ 50.00 Lac');
  });

  it('treats null/invalid as zero', () => {
    expect(formatAgreementValueCompact(null, null)).toBe('₹ 0');
    expect(formatAgreementValueCompact(undefined, 100)).toBe('₹ 0');
  });
});

describe('unitBillableAreaSqft', () => {
  it('prefers carpet_area over bua_area and area', () => {
    const unit: UnitPricingInput = {
      area: 1200,
      carpet_area: 900,
      bua_area: 1000,
      rate: 5000
    };
    expect(unitBillableAreaSqft(unit)).toBe(900);
  });

  it('falls back to bua_area when carpet is missing or zero', () => {
    expect(
      unitBillableAreaSqft({ area: 1200, bua_area: 1000, rate: 5000 })
    ).toBe(1000);
    expect(
      unitBillableAreaSqft({
        area: 1200,
        carpet_area: 0,
        bua_area: 1000,
        rate: 5000
      })
    ).toBe(1000);
  });

  it('falls back to area when carpet and bua are missing', () => {
    expect(unitBillableAreaSqft({ area: 1200, rate: 5000 })).toBe(1200);
  });

  it('returns 0 when no positive area', () => {
    expect(unitBillableAreaSqft({ area: null, rate: 5000 })).toBe(0);
    expect(unitBillableAreaSqft({ area: 0, carpet_area: -1, rate: 5000 })).toBe(
      0
    );
  });
});

describe('unitBaseAgreementInr', () => {
  it('computes billable area × rate', () => {
    expect(
      unitBaseAgreementInr({ carpet_area: 1000, rate: 5000, area: null })
    ).toBe(5000000);
  });

  it('treats missing rate as zero', () => {
    expect(unitBaseAgreementInr({ area: 1000, rate: null })).toBe(0);
  });
});

describe('unitAgreementTotalInr', () => {
  it('sums base + floor rise + PLC', () => {
    expect(
      unitAgreementTotalInr({
        carpet_area: 1000,
        rate: 5000,
        floor_rise_charge: 50000,
        plc_charge: 25000
      })
    ).toBe(5075000);
  });

  it('ignores negative floor rise and PLC', () => {
    expect(
      unitAgreementTotalInr({
        area: 1000,
        rate: 5000,
        floor_rise_charge: -100,
        plc_charge: -50
      })
    ).toBe(5000000);
  });
});

describe('formatUnitAgreementValueCompact', () => {
  it('formats agreement total in Lac/Cr style', () => {
    expect(
      formatUnitAgreementValueCompact({ area: 1000, rate: 5000 })
    ).toBe('₹ 50.00 Lac');
  });
});
