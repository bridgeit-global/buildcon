import { describe, expect, it } from 'vitest';
import {
  inquiryTokenPayloadsEqual,
  isInquiryTokenComplete,
  isInquiryTokenLocked,
  isInquiryTokenRecorded
} from './inquiry-token-stage';

const completeToken = {
  token: {
    amount: '100000',
    date: '2026-01-15',
    mode: 'UPI',
    reference: 'TXN123',
    notes: 'Paid at site'
  }
};

describe('isInquiryTokenComplete', () => {
  it('returns true when amount, date, and mode are present', () => {
    expect(isInquiryTokenComplete(completeToken)).toBe(true);
  });

  it('returns false when required fields are missing', () => {
    expect(isInquiryTokenComplete({ token: { amount: '100000' } })).toBe(false);
    expect(isInquiryTokenComplete(null)).toBe(false);
  });
});

describe('isInquiryTokenRecorded', () => {
  it('returns true when recorded_at is set', () => {
    expect(
      isInquiryTokenRecorded({
        token: { recorded_at: '2026-01-15T10:00:00Z' }
      })
    ).toBe(true);
  });

  it('returns true when token is complete even without recorded_at', () => {
    expect(isInquiryTokenRecorded(completeToken)).toBe(true);
  });

  it('returns false for incomplete token without recorded_at', () => {
    expect(isInquiryTokenRecorded({ token: { amount: '100000' } })).toBe(false);
  });
});

describe('isInquiryTokenLocked', () => {
  it('locks when booking is confirmed or inquiry is closed', () => {
    expect(isInquiryTokenLocked({}, { bookingConfirmed: true })).toBe(true);
    expect(isInquiryTokenLocked({}, { inquiryClosed: true })).toBe(true);
  });

  it('locks when token is recorded', () => {
    expect(isInquiryTokenLocked(completeToken)).toBe(true);
  });

  it('does not lock editable draft token', () => {
    expect(isInquiryTokenLocked({ token: { amount: '50000' } })).toBe(false);
  });
});

describe('inquiryTokenPayloadsEqual', () => {
  it('compares all token fields ignoring whitespace', () => {
    expect(
      inquiryTokenPayloadsEqual(
        { amount: ' 100000 ', date: '2026-01-15', mode: 'UPI' },
        { amount: '100000', date: '2026-01-15', mode: 'UPI' }
      )
    ).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(
      inquiryTokenPayloadsEqual(
        { amount: '100000', mode: 'UPI' },
        { amount: '100000', mode: 'Cash' }
      )
    ).toBe(false);
  });

  it('treats nullish payloads as empty objects', () => {
    expect(inquiryTokenPayloadsEqual(null, undefined)).toBe(true);
  });
});
