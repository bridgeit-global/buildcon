import { describe, expect, it } from 'vitest';
import { unitBlockSchema, unitEditSchema } from './unit-edit.schema';

describe('unitEditSchema', () => {
  const valid = {
    unit_code: 'A-101',
    area: 750,
    rate: 10500,
    status: 'AVAILABLE',
    blocked_reason: ''
  };

  it('accepts minimal valid payload', () => {
    expect(unitEditSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty unit code', () => {
    expect(
      unitEditSchema.safeParse({ ...valid, unit_code: '' }).success
    ).toBe(false);
  });

  it('rejects area below 1', () => {
    expect(unitEditSchema.safeParse({ ...valid, area: 0 }).success).toBe(false);
  });

  it('requires blocked reason when status is BLOCKED', () => {
    const result = unitEditSchema.safeParse({
      ...valid,
      status: 'BLOCKED',
      blocked_reason: ''
    });
    expect(result.success).toBe(false);
  });

  it('accepts BLOCKED with reason', () => {
    const result = unitEditSchema.safeParse({
      ...valid,
      status: 'BLOCKED',
      blocked_reason: 'Hold for VIP'
    });
    expect(result.success).toBe(true);
  });
});

describe('unitBlockSchema', () => {
  it('accepts valid block payload', () => {
    expect(
      unitBlockSchema.safeParse({
        blockUnitId: 'unit-1',
        blockReason: 'Customer hold'
      }).success
    ).toBe(true);
  });

  it('rejects missing unit id', () => {
    expect(
      unitBlockSchema.safeParse({
        blockUnitId: '',
        blockReason: 'Hold'
      }).success
    ).toBe(false);
  });
});
