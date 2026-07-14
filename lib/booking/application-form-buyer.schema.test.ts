import { describe, expect, it } from 'vitest';
import {
  addressesMatch,
  inferPermanentSameAsCorrespondence,
  validateApplicationFormBuyer,
  type ApplicationFormAddress
} from './application-form-buyer.schema';

const fullAddress = (
  overrides: Partial<ApplicationFormAddress> = {}
): ApplicationFormAddress => ({
  address_line1: 'Line 1',
  address_line2: 'Line 2',
  address_line3: 'Line 3',
  city: null,
  state: 'Maharashtra',
  pin: '400001',
  ...overrides
});

const validBuyer = {
  first_name: 'Ravi',
  middle_name: '',
  last_name: 'Kumar',
  phone: '9876543210',
  phone_secondary: '',
  email: 'ravi@example.com',
  guardian_name: 'Father Name',
  guardian_relation: 'Father',
  dob: '1990-05-15',
  nationality: 'Indian',
  residential_status: 'Resident Indian',
  id_proof_type: 'Aadhaar Card',
  pan: 'ABCDE1234F',
  aadhaarLast4: '123456789012',
  residentialAddress: fullAddress(),
  permanentAddress: fullAddress(),
  permanentSameAsCorrespondence: 'same' as const
};

describe('validateApplicationFormBuyer', () => {
  it('accepts a complete buyer', () => {
    expect(validateApplicationFormBuyer(validBuyer)).toEqual({});
  });

  it('requires residential address lines and state', () => {
    const errors = validateApplicationFormBuyer({
      ...validBuyer,
      residentialAddress: fullAddress({ address_line2: '' })
    });
    expect(errors.res_address_line2).toBeTruthy();
  });

  it('requires passport ID proof for NRI', () => {
    const errors = validateApplicationFormBuyer({
      ...validBuyer,
      residential_status: 'NRI',
      id_proof_type: 'Aadhaar Card'
    });
    expect(errors.id_proof_type).toMatch(/Passport/i);
  });

  it('validates permanent address when different', () => {
    const errors = validateApplicationFormBuyer({
      ...validBuyer,
      permanentSameAsCorrespondence: 'different',
      permanentAddress: fullAddress({ state: '' })
    });
    expect(errors.perm_address_state).toBeTruthy();
  });
});

describe('addressesMatch', () => {
  it('compares normalized address fields', () => {
    expect(addressesMatch(fullAddress(), fullAddress())).toBe(true);
    expect(addressesMatch(fullAddress(), fullAddress({ pin: '411001' }))).toBe(
      false
    );
  });
});

describe('inferPermanentSameAsCorrespondence', () => {
  it('returns same when permanent is empty', () => {
    expect(inferPermanentSameAsCorrespondence(fullAddress(), null)).toBe('same');
  });

  it('returns different when addresses differ', () => {
    expect(
      inferPermanentSameAsCorrespondence(
        fullAddress(),
        fullAddress({ pin: '411001' })
      )
    ).toBe('different');
  });
});
