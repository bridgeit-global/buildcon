import { describe, expect, it } from 'vitest';
import {
  addressFormSchema,
  bankFormSchema,
  customerCreatePayload,
  customerCreateSchema,
  customerEditPayload,
  customerEditSchema,
  kycIdentitySchema,
  kycUploadSchema,
  nomineeFormSchema
} from './customer-forms.schema';

describe('customerCreateSchema', () => {
  const valid = {
    full_name: 'Ravi Kumar',
    phone: '9876543210',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    guardian_name: '',
    residential_status: 'Resident Indian',
    passport_number: '',
    office_name_address: ''
  };

  it('accepts minimal valid payload', () => {
    expect(customerCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      customerCreateSchema.safeParse({ ...valid, full_name: '' }).success
    ).toBe(false);
  });

  it('rejects invalid phone', () => {
    expect(
      customerCreateSchema.safeParse({ ...valid, phone: '12' }).success
    ).toBe(false);
  });
});

describe('customerEditSchema', () => {
  const valid = {
    full_name: 'Ravi Kumar',
    phone: '9876543210',
    email: '',
    dob: '',
    occupation: '',
    nationality: 'Indian',
    guardian_name: '',
    residential_status: 'Resident Indian',
    passport_number: '',
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
  it('accepts valid address', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'current',
        address_line1: '12 Main St',
        city: 'Mumbai',
        state: 'MH',
        pin: '400001'
      }).success
    ).toBe(true);
  });

  it('rejects invalid PIN when provided', () => {
    expect(
      addressFormSchema.safeParse({
        kind: 'permanent',
        address_line1: '12 Main St',
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

describe('customer payload helpers', () => {
  it('customerCreatePayload normalizes phone', () => {
    const payload = customerCreatePayload({
      full_name: 'Test User',
      phone: '+91 98765 43210',
      email: '',
      dob: '',
      occupation: '',
      nationality: 'Indian',
      guardian_name: '',
      residential_status: 'Resident Indian',
      passport_number: '',
      office_name_address: ''
    });
    expect(payload.phone).toBe('919876543210');
  });

  it('customerEditPayload includes normalized KYC', () => {
    const payload = customerEditPayload({
      full_name: 'Test User',
      phone: '9876543210',
      email: '',
      dob: '',
      occupation: '',
      nationality: 'Indian',
      guardian_name: '',
      residential_status: 'Resident Indian',
      passport_number: '',
      office_name_address: '',
      pan_number: 'abcde1234f',
      aadhaar_last4: '1234-5678-9012'
    });
    expect(payload.pan_number).toBe('ABCDE1234F');
    expect(payload.aadhaar_last4).toBe('123456789012');
  });
});
