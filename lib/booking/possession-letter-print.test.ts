import { beforeAll, describe, expect, it } from 'vitest';
import { buildPossessionLetterHtml, type PossessionLetterInput } from './possession-letter-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const baseInput: PossessionLetterInput = {
  bookingId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  bookingCreatedAt: '2026-01-10',
  projectName: 'Sunrise Heights',
  projectLocation: 'Pune, Maharashtra',
  unitCode: 'A-101',
  wingName: 'Tower A',
  floor: 12,
  unitType: '3 BHK',
  customerName: 'Ravi Kumar',
  coBuyerNames: ['Priya Kumar'],
  bookingAmount: 7_500_000,
  possessionDate: '2026-06-20',
  occupancyCertificateRef: 'OC/2026/0142',
  handoverContact: 'Site Office — 9876543210',
  generatedAt: FIXED_AT
};

describe('buildPossessionLetterHtml', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('matches snapshot for fixed fixture', () => {
    expect(buildPossessionLetterHtml(baseInput)).toMatchSnapshot();
  });
});
