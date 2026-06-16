import { describe, expect, it } from 'vitest';
import {
  buildBookingPrefillFromInquiry,
  tokenStageFromInquiry
} from './booking-prefill-from-inquiry';

const inquiryId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('tokenStageFromInquiry', () => {
  it('returns empty object for invalid stage data', () => {
    expect(tokenStageFromInquiry(null)).toEqual({});
    expect(tokenStageFromInquiry([] as unknown as Record<string, unknown>)).toEqual(
      {}
    );
  });

  it('extracts token fields from stage data', () => {
    expect(
      tokenStageFromInquiry({
        token: { amount: '50000', date: '2026-02-01', mode: 'UPI' }
      })
    ).toEqual({ amount: '50000', date: '2026-02-01', mode: 'UPI' });
  });
});

describe('buildBookingPrefillFromInquiry', () => {
  it('builds prefill with token and negotiation fields', () => {
    const prefill = buildBookingPrefillFromInquiry({
      inquiryId,
      projectId: 'proj-1',
      customerId: 'cust-1',
      unitId: 'unit-1',
      stageData: {
        token: {
          amount: '100000',
          date: '2026-03-01',
          mode: 'NEFT/RTGS',
          reference: 'NEFT-99'
        },
        negotiation: { offered_price: '9500000' }
      },
      parkingRequired: 'Yes',
      parkingCount: '2',
      parkingSlotsAvailable: 5,
      parkingRateSnapshot: 250000
    });

    expect(prefill).toMatchObject({
      projectId: 'proj-1',
      inquiryId,
      inquiryRef: 'INQ-A1B2C3D4E5',
      customerId: 'cust-1',
      unitId: 'unit-1',
      parkingRequired: 'Yes',
      parkingCount: '2',
      parkingSlotsAvailable: 5,
      parkingRateSnapshot: 250000,
      bookingAmount: '100000',
      tokenDate: '2026-03-01',
      paymentMode: 'NEFT/RTGS',
      paymentReference: 'NEFT-99',
      negotiatedPriceInr: 9_500_000
    });
  });

  it('defaults parking and nulls invalid payment mode', () => {
    const prefill = buildBookingPrefillFromInquiry({
      inquiryId,
      projectId: 'proj-1',
      customerId: 'cust-1',
      unitId: 'unit-1',
      stageData: { token: { mode: 'InvalidMode' } }
    });

    expect(prefill.parkingRequired).toBe('No');
    expect(prefill.parkingCount).toBe('1');
    expect(prefill.paymentMode).toBeNull();
    expect(prefill.bookingAmount).toBeNull();
    expect(prefill.negotiatedPriceInr).toBeNull();
  });

  it('accepts valid booking payment modes only', () => {
    const prefill = buildBookingPrefillFromInquiry({
      inquiryId,
      projectId: 'p',
      customerId: 'c',
      unitId: 'u',
      stageData: { token: { mode: 'Construction Linked' } }
    });
    expect(prefill.paymentMode).toBe('Construction Linked');
  });
});
