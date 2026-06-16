import { beforeAll, describe, expect, it } from 'vitest';
import type { ApplicationFormApplicantRow } from '@/lib/customer/application-form-data';
import {
  buildApplicationFormHtml,
  type ApplicationFormPrintInput
} from './application-form-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const applicant: ApplicationFormApplicantRow = {
  role: 'Primary',
  customerId: 'cust-001',
  fullName: 'Ravi Kumar',
  guardianName: 'Suresh Kumar',
  dob: '15-05-1985',
  pan: 'ABCDE1234F',
  aadhaar: '1234 5678 9012',
  nationality: 'Indian',
  residentialStatus: 'Resident Indian',
  profession: 'Engineer',
  passportNo: '',
  permanentAddress: 'Village Road, Nashik, Maharashtra',
  mobile: '9876543210',
  email: 'ravi@example.com',
  communicationAddress: '12 MG Road, Pune, Maharashtra 411001',
  officeNameAddress: 'Tech Park, Pune'
};

const baseInput: ApplicationFormPrintInput = {
  applicationFormNo: 'AF-2026-001',
  projectName: 'Sunrise Heights',
  projectLocation: 'Baner, Pune',
  unitCode: 'A-101',
  wingName: 'Tower A',
  floor: 12,
  unitType: '3 BHK',
  bookingAmount: 7_500_000,
  paymentMode: 'NEFT',
  tokenDate: '2026-06-01',
  tokenReference: 'NEFT-REF-001',
  loanFromBank: true,
  preferredBank: 'HDFC Bank',
  applicants: [applicant],
  applicantPhotoUrls: [null, null, null],
  generatedAt: FIXED_AT
};

describe('buildApplicationFormHtml', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('matches snapshot for fixed fixture', () => {
    expect(buildApplicationFormHtml(baseInput)).toMatchSnapshot();
  });
});
