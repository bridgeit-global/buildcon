import { describe, expect, it } from 'vitest';
import { zodFieldErrors } from '@/lib/form/zod-field-errors';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';
import {
  EMPTY_ORGANIZATION_SETTINGS_FORM,
  organizationSettingsFormSchema,
  organizationSettingsPayload
} from './organization-settings.schema';

describe('organizationSettingsFormSchema', () => {
  it('requires legal and trade names', () => {
    const result = organizationSettingsFormSchema.safeParse({
      ...EMPTY_ORGANIZATION_SETTINGS_FORM,
      legal_name: '',
      trade_name: ''
    });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors(result);
    expect(errors.legal_name).toMatch(/legal name/i);
    expect(errors.trade_name).toMatch(/trade/i);
  });

  it('rejects invalid contact and tax fields', () => {
    const result = organizationSettingsFormSchema.safeParse({
      ...EMPTY_ORGANIZATION_SETTINGS_FORM,
      legal_name: 'Acme Developers Pvt Ltd',
      trade_name: 'Acme',
      pin: '12',
      phone: '12345',
      email: 'not-an-email',
      website: 'notaurl',
      pan: 'BAD',
      gstin: 'BAD',
      cin: 'BAD',
      bank_account_no: '12',
      bank_ifsc: 'BAD'
    });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors(result);
    expect(errors.pin).toBeTruthy();
    expect(errors.phone).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.website).toBeTruthy();
    expect(errors.pan).toBeTruthy();
    expect(errors.gstin).toBeTruthy();
    expect(errors.cin).toBeTruthy();
    expect(errors.bank_account_no).toBeTruthy();
    expect(errors.bank_ifsc).toBeTruthy();
  });

  it('accepts a valid builder profile', () => {
    const values = {
      legal_name: 'Sunrise Developers Pvt Ltd',
      trade_name: 'Sunrise Homes',
      registered_address: '12 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pin: '411001',
      phone: '9876543210',
      phone_country: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
      email: 'info@sunrise.example',
      website: 'https://sunrise.example',
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      cin: 'U45200MH2020PTC123456',
      rera_promoter_no: 'P52100012345',
      authorized_signatory_name: 'A. Sharma',
      bank_name: 'HDFC Bank',
      bank_account_name: 'Sunrise Developers Pvt Ltd',
      bank_account_no: '123456789012',
      bank_ifsc: 'HDFC0001234',
      notes: ''
    };
    const parsed = organizationSettingsFormSchema.safeParse(values);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(organizationSettingsPayload(parsed.data).pan).toBe('ABCDE1234F');
    expect(organizationSettingsPayload(parsed.data).phone).toBe('9876543210');
    expect(organizationSettingsPayload(parsed.data).website).toBe(
      'https://sunrise.example'
    );
  });
});
