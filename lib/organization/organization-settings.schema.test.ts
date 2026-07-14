import { describe, expect, it } from 'vitest';
import {
  organizationSettingsFormSchema,
  organizationSettingsPayload
} from './organization-settings.schema';

describe('organizationSettingsFormSchema', () => {
  it('requires legal and trade names', () => {
    const result = organizationSettingsFormSchema.safeParse({
      legal_name: '',
      trade_name: '',
      registered_address: '',
      city: '',
      state: '',
      pin: '',
      phone: '',
      email: '',
      website: '',
      pan: '',
      gstin: '',
      cin: '',
      rera_promoter_no: '',
      authorized_signatory_name: '',
      bank_name: '',
      bank_account_name: '',
      bank_account_no: '',
      bank_ifsc: '',
      notes: ''
    });
    expect(result.success).toBe(false);
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
  });
});
