import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bucketUnitStatus,
  canonicalUnitStatusCode,
  countInventoryBuckets,
  countUnitStatusBreakdown,
  inrToCr,
  inrToCrLabel,
  labelFromMonthKey,
  monthKeyFromIsoDate,
  recentMonthKeys,
  salesVsCollectionsSeries,
  seriesFromMonthMap
} from './dashboard-utils';

describe('inrToCr', () => {
  it('converts INR to crore with floor at zero', () => {
    expect(inrToCr(10_000_000)).toBe(1);
    expect(inrToCr(-500)).toBe(0);
    expect(inrToCr(Number.NaN)).toBe(0);
  });
});

describe('inrToCrLabel', () => {
  it('formats to two decimal places', () => {
    expect(inrToCrLabel(12_345_678)).toBe('1.23');
  });
});

describe('canonicalUnitStatusCode', () => {
  it('maps legacy codes to canonical values', () => {
    expect(canonicalUnitStatusCode('A')).toBe('AVAILABLE');
    expect(canonicalUnitStatusCode('BL')).toBe('BLOCKED');
    expect(canonicalUnitStatusCode('B')).toBe('BOOKED');
    expect(canonicalUnitStatusCode('S')).toBe('REGISTERED');
  });

  it('passes through post-booking stages', () => {
    expect(canonicalUnitStatusCode('POSSESSED')).toBe('POSSESSED');
    expect(canonicalUnitStatusCode('CANCELLED')).toBe('CANCELLED');
  });
});

describe('countUnitStatusBreakdown', () => {
  it('aggregates counts with labels', () => {
    const slices = countUnitStatusBreakdown(['AVAILABLE', 'A', 'BOOKED', 'B', 'CANCELLED']);
    const byCode = Object.fromEntries(slices.map((s) => [s.code, s.count]));
    expect(byCode.AVAILABLE).toBe(2);
    expect(byCode.BOOKED).toBe(2);
    expect(byCode.CANCELLED).toBe(1);
    expect(slices.find((s) => s.code === 'CANCELLED')?.muted).toBe(true);
  });
});

describe('bucketUnitStatus', () => {
  it('maps statuses into inventory buckets', () => {
    expect(bucketUnitStatus('AVAILABLE')).toBe('available');
    expect(bucketUnitStatus('TOKEN')).toBe('booked');
    expect(bucketUnitStatus('REGISTERED')).toBe('sold');
    expect(bucketUnitStatus('BL')).toBe('blocked');
    expect(bucketUnitStatus('unknown')).toBe('other');
  });
});

describe('countInventoryBuckets', () => {
  it('counts bucket totals', () => {
    expect(
      countInventoryBuckets(['AVAILABLE', 'BOOKED', 'REGISTERED', 'BLOCKED', 'garbage'])
    ).toEqual({
      available: 1,
      booked: 1,
      sold: 1,
      blocked: 1
    });
  });
});

describe('monthKeyFromIsoDate', () => {
  it('returns YYYY-MM for ISO dates', () => {
    expect(monthKeyFromIsoDate('2026-03-15')).toBe('2026-03');
    expect(monthKeyFromIsoDate('2026-03-15T14:00:00.000Z')).toMatch(/^2026-03$/);
  });

  it('returns null for invalid input', () => {
    expect(monthKeyFromIsoDate(null)).toBeNull();
    expect(monthKeyFromIsoDate('not-a-date')).toBeNull();
  });
});

describe('labelFromMonthKey', () => {
  it('maps month keys to short labels', () => {
    expect(labelFromMonthKey('2026-01')).toBe('Jan');
    expect(labelFromMonthKey('2026-12')).toBe('Dec');
  });
});

describe('recentMonthKeys', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns oldest-to-newest month keys', () => {
    expect(recentMonthKeys(3)).toEqual(['2026-04', '2026-05', '2026-06']);
  });
});

describe('seriesFromMonthMap', () => {
  it('builds month points in crore', () => {
    expect(
      seriesFromMonthMap(['2026-01', '2026-02'], {
        '2026-01': 10_000_000,
        '2026-02': 0
      })
    ).toEqual([
      { month: 'Jan', amount: 1 },
      { month: 'Feb', amount: 0 }
    ]);
  });
});

describe('salesVsCollectionsSeries', () => {
  it('builds sales and collections series', () => {
    expect(
      salesVsCollectionsSeries(['2026-03'], { '2026-03': 20_000_000 }, { '2026-03': 5_000_000 })
    ).toEqual([{ month: 'Mar', sales: 2, collections: 0.5 }]);
  });
});
