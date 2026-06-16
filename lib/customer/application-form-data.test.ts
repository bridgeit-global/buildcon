import { describe, expect, it } from 'vitest';
import {
  buildApplicantRows,
  formatCustomerAddress,
  formatDobForForm,
  pickCustomerAddress,
  type CustomerAddressSnippet,
  type CustomerApplicationProfile
} from './application-form-data';

describe('formatCustomerAddress', () => {
  it('joins address parts', () => {
    expect(
      formatCustomerAddress({
        address_line1: '12 Main St',
        city: 'Mumbai',
        state: 'MH',
        pin: '400001'
      })
    ).toBe('12 Main St, Mumbai, MH, 400001');
  });

  it('returns empty string for null', () => {
    expect(formatCustomerAddress(null)).toBe('');
  });
});

describe('pickCustomerAddress', () => {
  const addresses: CustomerAddressSnippet[] = [
    {
      kind: 'current',
      address_line1: 'Flat 2',
      city: 'Pune',
      state: 'MH',
      pin: '411001'
    },
    {
      kind: 'permanent',
      address_line1: 'Village Rd',
      city: 'Nashik',
      state: 'MH',
      pin: '422001'
    }
  ];

  it('picks address by kind', () => {
    expect(pickCustomerAddress(addresses, 'permanent')?.city).toBe('Nashik');
  });

  it('returns null when kind is missing', () => {
    expect(pickCustomerAddress(addresses, 'current')?.kind).toBe('current');
    expect(pickCustomerAddress([], 'current')).toBeNull();
  });
});

describe('formatDobForForm', () => {
  it('formats ISO date for display', () => {
    expect(formatDobForForm('1990-05-15')).toMatch(/15-05-1990/);
  });

  it('returns dash for empty dob', () => {
    expect(formatDobForForm(null)).toBe('—');
  });
});

describe('buildApplicantRows', () => {
  const buyers = [
    { id: 'c1', label: 'Buyer One' },
    { id: 'c2', label: 'Buyer Two' }
  ];

  const profiles = new Map<string, CustomerApplicationProfile>([
    [
      'c1',
      {
        id: 'c1',
        full_name: 'Ravi Kumar',
        phone: '9876543210',
        email: 'ravi@example.com',
        dob: '1985-03-10',
        occupation: 'Engineer',
        nationality: 'Indian',
        pan_number: 'ABCDE1234F',
        aadhaar_last4: '123456789012',
        guardian_name: 'Father',
        residential_status: 'Resident Indian',
        passport_number: '',
        office_name_address: 'Tech Park'
      }
    ]
  ]);

  const addressesByCustomer = new Map<string, CustomerAddressSnippet[]>([
    [
      'c1',
      [
        {
          kind: 'current',
          address_line1: '12 Main St',
          city: 'Mumbai',
          state: 'MH',
          pin: '400001'
        }
      ]
    ]
  ]);

  it('builds applicant rows with roles and masked Aadhaar', () => {
    const rows = buildApplicantRows(buyers, profiles, addressesByCustomer);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.role).toBe('1st Applicant (Sole/First)');
    expect(rows[0]?.fullName).toBe('Ravi Kumar');
    expect(rows[0]?.aadhaar).toBe('XXXX-XXXX-9012');
    expect(rows[0]?.communicationAddress).toContain('12 Main St');
    expect(rows[1]?.role).toBe('2nd Applicant');
    expect(rows[1]?.fullName).toBe('Buyer Two');
  });
});
