import { describe, expect, it } from 'vitest';
import {
  buildUnitSpecificationRows,
  computeBookingCostBreakdown,
  formatProjectParkingSummary,
  parkingSlotsAskedFromCount,
  type UnitCostInput
} from './booking-cost-utils';

const baseUnit: UnitCostInput = {
  unit_code: 'A-101',
  wing_name: 'Tower A',
  floor: 1,
  unit_no: 1,
  project_name: 'Sunrise Heights',
  unit_type: '2 BHK',
  area: 1200,
  carpet_area: 900,
  bua_area: 1000,
  rate: 5000,
  floor_rise_charge: 50000,
  plc_charge: 25000,
  parking_slots_included: 1,
  status: 'AVAILABLE'
};

describe('parkingSlotsAskedFromCount', () => {
  it('maps 4+ to 4', () => {
    expect(parkingSlotsAskedFromCount('4+')).toBe(4);
  });

  it('parses numeric counts with minimum 1', () => {
    expect(parkingSlotsAskedFromCount('2')).toBe(2);
    expect(parkingSlotsAskedFromCount('0')).toBe(1);
    expect(parkingSlotsAskedFromCount('-3')).toBe(1);
  });

  it('defaults to 1 for empty or invalid input', () => {
    expect(parkingSlotsAskedFromCount('')).toBe(1);
    expect(parkingSlotsAskedFromCount('abc')).toBe(1);
    expect(parkingSlotsAskedFromCount('  ')).toBe(1);
  });
});

describe('formatProjectParkingSummary', () => {
  it('returns em dash for null', () => {
    expect(formatProjectParkingSummary(null)).toBe('—');
  });

  it('returns not configured when slots missing or zero', () => {
    expect(
      formatProjectParkingSummary({ parking_slots: null, parking_rate: 100000 })
    ).toBe('Not configured on project');
    expect(
      formatProjectParkingSummary({ parking_slots: 0, parking_rate: 100000 })
    ).toBe('Not configured on project');
  });

  it('formats slots with optional rate', () => {
    expect(
      formatProjectParkingSummary({ parking_slots: 1, parking_rate: 100000 })
    ).toBe('1 slot available · ₹1,00,000 / slot');
    expect(
      formatProjectParkingSummary({ parking_slots: 3, parking_rate: null })
    ).toBe('3 slots available');
    expect(
      formatProjectParkingSummary({ parking_slots: 2, parking_rate: 0 })
    ).toBe('2 slots available');
  });
});

describe('buildUnitSpecificationRows', () => {
  it('includes project and unit details', () => {
    const rows = buildUnitSpecificationRows(baseUnit);
    expect(rows[0]).toEqual(['Project', 'Sunrise Heights']);
    expect(rows.find((r) => r[0] === 'Unit code')).toEqual(['Unit code', 'A-101']);
    expect(rows.find((r) => r[0] === 'Floor')).toEqual(['Floor', 'Floor 1']);
    expect(rows.find((r) => r[0] === 'Configuration')).toEqual([
      'Configuration',
      '2 BHK'
    ]);
  });

  it('shows billable area with legacy note when different', () => {
    const rows = buildUnitSpecificationRows(baseUnit);
    const billable = rows.find((r) => r[0] === 'Billable (pricing)');
    expect(billable?.[1]).toContain('900 sq.ft');
    expect(billable?.[1]).toContain('legacy saleable 1,200');
  });

  it('omits project row when name is empty', () => {
    const rows = buildUnitSpecificationRows({
      ...baseUnit,
      project_name: ''
    });
    expect(rows[0][0]).not.toBe('Project');
  });

  it('shows parking bundled count', () => {
    const rows = buildUnitSpecificationRows(baseUnit);
    expect(rows.find((r) => r[0] === 'Parking bundled with unit')).toEqual([
      'Parking bundled with unit',
      '1 slot'
    ]);
  });
});

describe('computeBookingCostBreakdown', () => {
  it('computes basic agreement and dwelling totals', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'No',
      '1',
      null,
      { parking_slots: 2, parking_rate: 100000 },
      null
    );

    expect(result.basicInr).toBe(4500000);
    expect(result.parkingExtraInr).toBe(0);
    expect(result.grandTotalInr).toBe(4575000);
    expect(result.slotsAsked).toBe(0);
    expect(result.unitHeadline).toBe('A-101 · Tower A');
  });

  it('adds parking extra when required', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'Yes',
      '2',
      100000,
      null,
      null
    );

    expect(result.slotsAsked).toBe(2);
    expect(result.slotRate).toBe(100000);
    expect(result.parkingExtraInr).toBe(200000);
    expect(result.grandTotalInr).toBe(4775000);
  });

  it('applies GST from pricing when registered', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'No',
      '1',
      null,
      null,
      {
        gst_registered: true,
        gst_percent: 12,
        stamp_duty_percent: 0,
        registration_fee: 0
      }
    );

    expect(result.gstAmountInr).toBe(549000);
    expect(result.grandTotalInr).toBe(4575000 + 549000);
  });

  it('applies default 5% GST when option set', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'No',
      '1',
      null,
      null,
      null,
      { applyDefaultGst: true }
    );

    expect(result.gstAmountInr).toBe(228750);
    expect(result.grandTotalInr).toBe(4575000 + 228750);
  });

  it('adds stamp duty and registration from pricing', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'No',
      '1',
      null,
      null,
      {
        gst_registered: false,
        gst_percent: 0,
        stamp_duty_percent: 6,
        registration_fee: 30000
      }
    );

    expect(result.stampDutyEstimateInr).toBe(274500);
    expect(result.registrationEstimateInr).toBe(30000);
    expect(result.grandTotalInr).toBe(4575000 + 274500 + 30000);
  });

  it('returns spec and pricing row groups', () => {
    const result = computeBookingCostBreakdown(
      baseUnit,
      'No',
      '1',
      null,
      null,
      null
    );

    expect(result.specRows.length).toBeGreaterThan(0);
    expect(result.pricingRows.length).toBeGreaterThan(0);
    expect(result.rows).toEqual([...result.specRows, ...result.pricingRows]);
  });
});
