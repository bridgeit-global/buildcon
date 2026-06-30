import { describe, expect, it } from 'vitest';
import {
  projectDetailsSchema,
  projectPricingSchema
} from './project-manage.schema';

describe('projectDetailsSchema', () => {
  const valid = {
    name: 'Sunrise Heights',
    location: 'Mumbai',
    type: 'Greenfield',
    status: 'Active',
    fy: '2026-27',
    rera_no: 'P51800012345',
    base_rate: '10500'
  };

  it('accepts minimal valid payload', () => {
    expect(projectDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty project name', () => {
    expect(
      projectDetailsSchema.safeParse({ ...valid, name: '' }).success
    ).toBe(false);
  });

  it('rejects missing project type', () => {
    expect(
      projectDetailsSchema.safeParse({ ...valid, type: '' }).success
    ).toBe(false);
  });

  it('rejects negative base rate', () => {
    expect(
      projectDetailsSchema.safeParse({ ...valid, base_rate: '-1' }).success
    ).toBe(false);
  });

  it('allows empty RERA for non-Ready project types', () => {
    expect(
      projectDetailsSchema.safeParse({ ...valid, rera_no: '' }).success
    ).toBe(true);
  });

  it('allows empty RERA for Ready projects', () => {
    expect(
      projectDetailsSchema.safeParse({
        ...valid,
        type: 'Ready',
        rera_no: ''
      }).success
    ).toBe(true);
  });
});

describe('projectPricingSchema', () => {
  const valid = { gstPct: '5', stampPct: '3', regFee: '30000' };

  it('accepts valid pricing fields', () => {
    expect(projectPricingSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts zero values', () => {
    expect(
      projectPricingSchema.safeParse({
        gstPct: '0',
        stampPct: '0',
        regFee: '0'
      }).success
    ).toBe(true);
  });

  it('rejects invalid gst percentage', () => {
    expect(
      projectPricingSchema.safeParse({ ...valid, gstPct: 'abc' }).success
    ).toBe(false);
  });
});
