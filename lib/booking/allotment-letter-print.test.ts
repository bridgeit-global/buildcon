import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildAllotmentLetterHtml,
  formatBookingDisplayId,
  type AllotmentLetterPrintInput
} from './allotment-letter-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const baseInput: AllotmentLetterPrintInput = {
  letterRef: 'AL-2026-001',
  allotmentDate: '2026-06-10',
  projectName: 'Sunrise Heights',
  projectLocation: 'Pune, Maharashtra',
  unitCode: 'A-101',
  wingName: 'Tower A',
  floor: 12,
  unitType: '3 BHK',
  bookingId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  bookingCreatedAt: '2026-01-10',
  bookingAmount: 7_500_000,
  customerName: 'Ravi Kumar',
  coBuyerNames: ['Priya Kumar'],
  customerAddress: '12 MG Road, Pune, Maharashtra 411001',
  generatedAt: FIXED_AT
};

describe('formatBookingDisplayId', () => {
  it('builds BK-year-compact id', () => {
    expect(formatBookingDisplayId('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-01-10')).toBe(
      'BK-2026-567890'
    );
  });
});

describe('buildAllotmentLetterHtml', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('matches snapshot for fixed fixture', () => {
    expect(buildAllotmentLetterHtml(baseInput)).toMatchSnapshot();
  });
});
