import { describe, expect, it, vi } from 'vitest';
import {
  addressFormSchema,
  bankFormSchema,
  customerCreateAddressesPayload,
  customerCreatePayload,
  customerCreateSchema,
  customerEditPayload,
  customerEditSchema,
  DEFAULT_GUARDIAN_RELATION,
  EMPTY_APPLICATION_ADDRESS,
  guardianNameFieldLabel,
  kycIdentitySchema,
  kycUploadSchema,
  nomineeFormSchema
} from './customer-forms.schema';

const validResidentialAddress = {
  address_line1: '12 Main St',
  address_line2: 'Near Park',
  address_line3: 'Andheri West',
  city: 'Mumbai',
  state: 'Maharashtra',
  pin: '400001'
};

describe('customerCreateSchema', () => {
  const valid = {
    first_name: 'Ravi',
    middle_name: '',
    last_name: 'Kumar',
    phone: '9876543210',
    phone_secondary: '',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    guardian_name: '',
    guardian_relation: DEFAULT_GUARDIAN_RELATION,
    residential_status: 'Resident Indian',
    passport_number: '',
    id_proof_type: '',
    office_name_address: '',
    residential_address: validResidentialAddress,
    permanent_same_as_correspondence: 'same' as const,
    permanent_address: { ...EMPTY_APPLICATION_ADDRESS }
  };

  it('accepts minimal valid payload', () => {
    expect(customerCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty first or last name', () => {
    expect(
      customerCreateSchema.safeParse({ ...valid, first_name: '' }).success
    ).toBe(false);
    expect(
      customerCreateSchema.safeParse({ ...valid, last_name: '' }).success
    ).toBe(false);
  });

  it('allows empty middle name', () => {
    expect(
      customerCreateSchema.safeParse({ ...valid, middle_name: '' }).success
    ).toBe(true);
  });

  it('rejects invalid phone', () => {
    expect(
      customerCreateSchema.safeParse({ ...valid, phone: '12' }).success
    ).toBe(false);
  });

  it('rejects future date of birth', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
    expect(
      customerCreateSchema.safeParse({ ...valid, dob: '2026-06-16' }).success
    ).toBe(false);
    vi.useRealTimers();
  });

  it('rejects secondary mobile equal to primary', () => {
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        phone_secondary: '9876543210'
      }).success
    ).toBe(false);
  });

  it('rejects non-passport ID proof for NRI', () => {
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        residential_status: 'NRI',
        id_proof_type: 'Aadhaar Card'
      }).success
    ).toBe(false);
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        residential_status: 'NRI',
        id_proof_type: 'Passport'
      }).success
    ).toBe(true);
  });

  it('requires residential address fields', () => {
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        residential_address: { ...EMPTY_APPLICATION_ADDRESS }
      }).success
    ).toBe(false);
  });

  it('requires permanent address when different from correspondence', () => {
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        permanent_same_as_correspondence: 'different',
        permanent_address: { ...EMPTY_APPLICATION_ADDRESS }
      }).success
    ).toBe(false);
    expect(
      customerCreateSchema.safeParse({
        ...valid,
        permanent_same_as_correspondence: 'different',
        permanent_address: validResidentialAddress
      }).success
    ).toBe(true);
  });
});

describe('customerEditSchema', () => {
  const valid = {
    first_name: 'Ravi',
    middle_name: '',
    last_name: 'Kumar',
    phone: '9876543210',
    phone_secondary: '',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    guardian_name: '',
    guardian_relation: DEFAULT_GUARDIAN_RELATION,
    residential_status: 'Resident Indian',
    passport_number: '',
    id_proof_type: '',
    office_name_address: '',
    pan_number: 'ABCDE1234F',
    aadhaar_last4: '123456789012'
  };

  it('accepts valid optional KYC fields', () => {
    expect(customerEditSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid PAN when provided', () => {
    expect(
      customerEditSchema.safeParse({ ...valid, pan_number: 'BAD' }).success
    ).toBe(false);
  });
});

describe('kycIdentitySchema', () => {
  it('accepts valid identifiers', () => {
    expect(
      kycIdentitySchema.safeParse({
        pan_number: 'ABCDE1234F',
        aadhaar_last4: '123456789012'
      }).success
    ).toBe(true);
  });

  it('rejects missing PAN', () => {
    expect(
      kycIdentitySchema.safeParse({
        pan_number: '',
        aadhaar_last4: '123456789012'
      }).success
    ).toBe(false);
  });
});

describe('addressFormSchema', () => {
  it('accepts a fully filled address', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'current',
        same_as_correspondence: false,
        address_line1: '12 Main St',
        address_line2: 'Near Park',
        address_line3: 'Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pin: '400001'
      }).success
    ).toBe(true);
  });

  it('accepts empty address lines 2 and 3', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'current',
        same_as_correspondence: false,
        address_line1: '12 Main St',
        address_line2: '',
        address_line3: '',
        city: 'Mumbai',
        state: 'Maharashtra',
        pin: '400001'
      }).success
    ).toBe(true);
  });

  it('rejects missing address line 1', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'current',
        same_as_correspondence: false,
        address_line1: '',
        address_line2: 'Near Park',
        address_line3: 'Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pin: '400001'
      }).success
    ).toBe(false);
  });

  it('requires state and valid PIN', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'permanent',
        same_as_correspondence: false,
        address_line1: '12 Main St',
        address_line2: 'Near Park',
        address_line3: 'Andheri West',
        city: '',
        state: '',
        pin: '12'
      }).success
    ).toBe(false);
  });
});

describe('nomineeFormSchema', () => {
  it('accepts nominee name', () => {
    expect(
      nomineeFormSchema.safeParse({
        nominee_name: 'Priya Kumar',
        relationship: 'Spouse',
        nominee_dob: '1990-01-01'
      }).success
    ).toBe(true);
  });

  it('rejects empty nominee name', () => {
    expect(
      nomineeFormSchema.safeParse({
        nominee_name: '',
        relationship: '',
        nominee_dob: ''
      }).success
    ).toBe(false);
  });

  it('rejects future nominee date of birth', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
    expect(
      nomineeFormSchema.safeParse({
        nominee_name: 'Priya Kumar',
        relationship: 'Spouse',
        nominee_dob: '2026-06-16'
      }).success
    ).toBe(false);
    vi.useRealTimers();
  });

  it('rejects nominee under 18', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
    const result = nomineeFormSchema.safeParse({
      nominee_name: 'Priya Kumar',
      relationship: 'Child',
      nominee_dob: '2015-01-01'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('18'))).toBe(true);
    }
    vi.useRealTimers();
  });
});

describe('bankFormSchema', () => {
  it('accepts valid bank details', () => {
    expect(
      bankFormSchema.safeParse({
        bank_name: 'HDFC Bank',
        account_no: '1234567890',
        ifsc: 'HDFC0001234',
        branch: 'Andheri'
      }).success
    ).toBe(true);
  });

  it('rejects invalid IFSC when provided', () => {
    expect(
      bankFormSchema.safeParse({
        bank_name: 'HDFC Bank',
        account_no: '',
        ifsc: 'INVALID',
        branch: ''
      }).success
    ).toBe(false);
  });
});

describe('kycUploadSchema', () => {
  it('accepts PAN upload with file', () => {
    expect(
      kycUploadSchema.safeParse({
        docType: 'pan',
        pan_number: 'ABCDE1234F',
        aadhaar_last4: '',
        hasFile: true
      }).success
    ).toBe(true);
  });

  it('requires file for upload', () => {
    expect(
      kycUploadSchema.safeParse({
        docType: 'pan',
        pan_number: 'ABCDE1234F',
        aadhaar_last4: '',
        hasFile: false
      }).success
    ).toBe(false);
  });

  it('requires valid Aadhaar for aadhaar doc type', () => {
    expect(
      kycUploadSchema.safeParse({
        docType: 'aadhaar',
        pan_number: '',
        aadhaar_last4: '1234',
        hasFile: true
      }).success
    ).toBe(false);
  });
});

describe('guardianNameFieldLabel', () => {
  it('uses relation-specific possessive labels', () => {
    expect(guardianNameFieldLabel('Father')).toBe("Father's name");
    expect(guardianNameFieldLabel('Mother')).toBe("Mother's name");
    expect(guardianNameFieldLabel('Spouse')).toBe("Spouse's name");
    expect(guardianNameFieldLabel('Other')).toBe('Guardian name');
  });

  it('defaults to Father when relation is empty', () => {
    expect(guardianNameFieldLabel('')).toBe("Father's name");
    expect(guardianNameFieldLabel(null)).toBe("Father's name");
  });
});

describe('customer payload helpers', () => {
  it('customerCreatePayload normalizes phone and composes full_name', () => {
    const payload = customerCreatePayload({
      first_name: 'Test',
      middle_name: '',
      last_name: 'User',
      phone: '+91 98765 43210',
      phone_secondary: '',
      email: '',
      dob: '',
      occupation: '',
      nationality: 'Indian',
      guardian_name: '',
      guardian_relation: DEFAULT_GUARDIAN_RELATION,
      residential_status: 'Resident Indian',
      passport_number: '',
      id_proof_type: '',
      office_name_address: ''
    });
    expect(payload.phone).toBe('919876543210');
    expect(payload.full_name).toBe('Test User');
    expect(payload.first_name).toBe('Test');
    expect(payload.last_name).toBe('User');
  });

  it('customerCreateAddressesPayload copies correspondence when same', () => {
    const payload = customerCreateAddressesPayload({
      first_name: 'Test',
      middle_name: '',
      last_name: 'User',
      phone: '9876543210',
      phone_secondary: '',
      email: '',
      dob: '',
      occupation: '',
      nationality: 'Indian',
      guardian_name: '',
      guardian_relation: DEFAULT_GUARDIAN_RELATION,
      residential_status: 'Resident Indian',
      passport_number: '',
      id_proof_type: '',
      office_name_address: '',
      residential_address: validResidentialAddress,
      permanent_same_as_correspondence: 'same',
      permanent_address: { ...EMPTY_APPLICATION_ADDRESS }
    });
    expect(payload.correspondence.address_line1).toBe('12 Main St');
    expect(payload.permanent).toEqual(payload.correspondence);
  });

  it('customerEditPayload includes KYC identifiers', () => {
    const payload = customerEditPayload({
      first_name: 'Test',
      middle_name: '',
      last_name: 'User',
      phone: '9876543210',
      phone_secondary: '',
      email: '',
      dob: '',
      occupation: '',
      nationality: 'Indian',
      guardian_name: '',
      guardian_relation: DEFAULT_GUARDIAN_RELATION,
      residential_status: 'Resident Indian',
      passport_number: '',
      id_proof_type: '',
      office_name_address: '',
      pan_number: 'abcde1234f',
      aadhaar_last4: '1234-5678-9012'
    });
    expect(payload.pan_number).toBe('ABCDE1234F');
    expect(payload.aadhaar_last4).toBe('123456789012');
  });
});
