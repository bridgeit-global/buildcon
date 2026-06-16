import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildRegistrationDeedHtml,
  type RegistrationDeedInput
} from './registration-deed-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const baseInput: RegistrationDeedInput = {
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
  registrationDate: '2026-06-01',
  subRegistrarOffice: 'Sub-Registrar, Pune Camp',
  documentNumber: 'REG/2026/0099',
  generatedAt: FIXED_AT
};

describe('buildRegistrationDeedHtml', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('matches snapshot for fixed fixture', () => {
    expect(buildRegistrationDeedHtml(baseInput)).toMatchSnapshot();
  });
});
