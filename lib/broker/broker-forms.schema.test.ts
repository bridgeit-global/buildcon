import { describe, expect, it } from 'vitest';
import {
  brokerFormPayload,
  brokerFormSchema,
  EMPTY_BROKER_FORM
} from './broker-forms.schema';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';

describe('brokerFormSchema', () => {
  const valid = {
    first_name: 'Prime',
    middle_name: '',
    last_name: 'Brokers',
    phone: '9876543210',
    phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: 'broker@example.com',
    license_no: 'BR-001',
    status: 'Active' as const,
    notes: 'Preferred partner'
  };

  it('accepts minimal valid payload', () => {
    expect(brokerFormSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts empty optional phone and email', () => {
    expect(
      brokerFormSchema.safeParse({
        ...valid,
        phone: '',
        email: ''
      }).success
    ).toBe(true);
  });

  it('rejects empty first or last name', () => {
    expect(
      brokerFormSchema.safeParse({ ...valid, first_name: '' }).success
    ).toBe(false);
    expect(
      brokerFormSchema.safeParse({ ...valid, last_name: '' }).success
    ).toBe(false);
  });

  it('rejects invalid phone when provided', () => {
    expect(
      brokerFormSchema.safeParse({ ...valid, phone: '123' }).success
    ).toBe(false);
  });

  it('rejects invalid status enum', () => {
    expect(
      brokerFormSchema.safeParse({ ...valid, status: 'Pending' }).success
    ).toBe(false);
  });
});

describe('brokerFormPayload', () => {
  it('normalizes phone digits and composes full_name', () => {
    const payload = brokerFormPayload({
      ...EMPTY_BROKER_FORM,
      first_name: '  Broker  ',
      middle_name: '',
      last_name: '  Co  ',
      phone: '+91 98765 43210',
      email: '  a@b.com  ',
      license_no: ' L-1 ',
      notes: ' note '
    });
    expect(payload.full_name).toBe('Broker Co');
    expect(payload.first_name).toBe('Broker');
    expect(payload.last_name).toBe('Co');
    expect(payload.phone).toBe('919876543210');
    expect(payload.email).toBe('a@b.com');
    expect(payload.license_no).toBe('L-1');
    expect(payload.notes).toBe('note');
  });

  it('maps blank optional fields to null', () => {
    const payload = brokerFormPayload({
      ...EMPTY_BROKER_FORM,
      first_name: 'Solo',
      last_name: 'Broker',
      phone: '',
      email: '',
      license_no: '',
      notes: ''
    });
    expect(payload.phone).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.license_no).toBeNull();
    expect(payload.notes).toBeNull();
    expect(payload.middle_name).toBeNull();
  });
});
