import { beforeAll, describe, expect, it } from 'vitest';
import type { UnitCostInput } from '@/app/crm/booking-cost-utils';
import { buildCostSheetHtml } from './cost-sheet-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const unit: UnitCostInput = {
  unit_code: 'A-101',
  wing_name: 'Tower A',
  floor: 12,
  unit_no: 101,
  project_name: 'Sunrise Heights',
  unit_type: '3 BHK',
  area: 1200,
  carpet_area: 900,
  bua_area: 1050,
  rate: 5500,
  floor_rise_charge: 75000,
  plc_charge: 50000,
  parking_slots_included: 1,
  status: 'AVAILABLE'
};

const baseInput = {
  unit,
  parkingRequired: 'Yes' as const,
  parkingCount: '2',
  projectParking: { parking_slots: 2, parking_rate: 350000 },
  projectPricing: {
    gst_registered: false,
    gst_percent: 5,
    stamp_duty_percent: 6,
    registration_fee: 30000
  },
  applyDefaultGst: true,
  customerName: 'Ravi Kumar',
  generatedAt: FIXED_AT
};

describe('buildCostSheetHtml', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('matches snapshot for fixed fixture', () => {
    expect(buildCostSheetHtml(baseInput)).toMatchSnapshot();
  });
});
