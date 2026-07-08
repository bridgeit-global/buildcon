import { describe, expect, it } from 'vitest';
import {
  inquirySiteVisitSchema,
  inquiryWizardStep1Schema,
  inquiryWizardStep2Schema
} from './inquiry-wizard.schema';

describe('inquiryWizardStep1Schema', () => {
  const valid = {
    customerName: 'Jane Doe',
    phone: '9876543210',
    email: '',
    leadSource: 'Walk-in',
    leadSourceOther: '',
    brokerId: ''
  };

  it('accepts minimal valid payload', () => {
    expect(inquiryWizardStep1Schema.safeParse(valid).success).toBe(true);
  });

  it('rejects short customer name', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      customerName: 'J'
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      phone: '123'
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing lead source', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      leadSource: ''
    });
    expect(result.success).toBe(false);
  });

  it('requires broker when lead source is Broker', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      leadSource: 'Broker',
      brokerId: ''
    });
    expect(result.success).toBe(false);
  });

  it('accepts broker lead with brokerId', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      leadSource: 'Broker',
      brokerId: 'broker-1'
    });
    expect(result.success).toBe(true);
  });

  it('requires custom text when lead source is Other', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      leadSource: 'Other',
      leadSourceOther: ''
    });
    expect(result.success).toBe(false);
  });

  it('accepts Other lead with custom text', () => {
    const result = inquiryWizardStep1Schema.safeParse({
      ...valid,
      leadSource: 'Other',
      leadSourceOther: 'Exhibition'
    });
    expect(result.success).toBe(true);
  });
});

describe('inquiryWizardStep2Schema', () => {
  it('accepts selected unit id', () => {
    expect(
      inquiryWizardStep2Schema.safeParse({ selectedUnitId: 'unit-1' }).success
    ).toBe(true);
  });

  it('accepts empty string after trim (no min length enforced)', () => {
    expect(
      inquiryWizardStep2Schema.safeParse({ selectedUnitId: '' }).success
    ).toBe(true);
  });

  it('rejects missing selected unit id', () => {
    expect(inquiryWizardStep2Schema.safeParse({}).success).toBe(false);
  });
});

describe('inquirySiteVisitSchema', () => {
  it('accepts Interested', () => {
    expect(
      inquirySiteVisitSchema.safeParse({ visitInterest: 'Interested' }).success
    ).toBe(true);
  });

  it('rejects invalid visit interest', () => {
    expect(
      inquirySiteVisitSchema.safeParse({ visitInterest: 'Maybe' }).success
    ).toBe(false);
  });
});
