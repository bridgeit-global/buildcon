import { describe, expect, it } from 'vitest';
import { calculateBookingRefund } from './refund-policy';

describe('calculateBookingRefund', () => {
  it('returns zero refund when nothing collected', () => {
    const result = calculateBookingRefund({ totalCollectedInr: 0 });
    expect(result.totalCollectedInr).toBe(0);
    expect(result.deductionAmountInr).toBe(0);
    expect(result.refundAmountInr).toBe(0);
    expect(result.policyNotes).toBe(
      'No collections recorded; refund amount is zero.'
    );
  });

  it('applies default 10% retention', () => {
    const result = calculateBookingRefund({ totalCollectedInr: 1000000 });
    expect(result.deductionPct).toBe(10);
    expect(result.deductionAmountInr).toBe(100000);
    expect(result.refundAmountInr).toBe(900000);
    expect(result.policyNotes).toContain('10% retention');
  });

  it('uses custom deduction percentage', () => {
    const result = calculateBookingRefund({
      totalCollectedInr: 500000,
      deductionPct: 25
    });
    expect(result.deductionPct).toBe(25);
    expect(result.deductionAmountInr).toBe(125000);
    expect(result.refundAmountInr).toBe(375000);
  });

  it('clamps deduction percentage to 0–100', () => {
    expect(
      calculateBookingRefund({
        totalCollectedInr: 100000,
        deductionPct: 150
      }).deductionPct
    ).toBe(100);
    expect(
      calculateBookingRefund({
        totalCollectedInr: 100000,
        deductionPct: -5
      }).deductionPct
    ).toBe(0);
  });

  it('applies minimum deduction when configured', () => {
    const result = calculateBookingRefund({
      totalCollectedInr: 100000,
      deductionPct: 5,
      minimumDeductionInr: 20000
    });
    expect(result.deductionAmountInr).toBe(20000);
    expect(result.refundAmountInr).toBe(80000);
  });

  it('caps minimum deduction at total collected', () => {
    const result = calculateBookingRefund({
      totalCollectedInr: 10000,
      deductionPct: 5,
      minimumDeductionInr: 50000
    });
    expect(result.deductionAmountInr).toBe(10000);
    expect(result.refundAmountInr).toBe(0);
  });

  it('treats negative collected as zero', () => {
    const result = calculateBookingRefund({ totalCollectedInr: -50000 });
    expect(result.totalCollectedInr).toBe(0);
    expect(result.refundAmountInr).toBe(0);
  });
});
