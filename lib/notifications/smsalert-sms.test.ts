import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildSmsPlainText } from './notification-templates';
import { getSmsAlertConfig, phoneToSmsMobileNo } from './smsalert-sms';

describe('phoneToSmsMobileNo', () => {
  it('returns null for empty input', () => {
    expect(phoneToSmsMobileNo(null)).toBeNull();
    expect(phoneToSmsMobileNo('')).toBeNull();
  });

  it('normalizes 10-digit numbers', () => {
    expect(phoneToSmsMobileNo('9876543210')).toBe('9876543210');
    expect(phoneToSmsMobileNo('+91 98765 43210')).toBe('9876543210');
  });

  it('strips country code 91 from 12-digit numbers', () => {
    expect(phoneToSmsMobileNo('919876543210')).toBe('9876543210');
  });

  it('strips leading 0 from 11-digit numbers', () => {
    expect(phoneToSmsMobileNo('09876543210')).toBe('9876543210');
  });

  it('returns null for invalid lengths', () => {
    expect(phoneToSmsMobileNo('12345')).toBeNull();
    expect(phoneToSmsMobileNo('91987654321')).toBeNull();
  });
});

describe('buildSmsPlainText', () => {
  afterEach(() => {
    delete process.env.SMS_DOCUMENT_MESSAGE;
  });

  it('returns null without env template', () => {
    expect(
      buildSmsPlainText(
        { fullName: 'Test', email: null, phoneE164Digits: '9876543210' },
        {
          kind: 'receipt',
          docLabel: 'Receipt',
          signedUrl: 'https://example.com/r.pdf',
          signedUrlValidDays: 3,
          fileName: 'receipt.pdf'
        }
      )
    ).toBeNull();
  });

  it('applies env template placeholders', () => {
    process.env.SMS_DOCUMENT_MESSAGE = 'Dear {name}, download {doc}: {url}';
    const text = buildSmsPlainText(
      { fullName: 'Asha', email: null, phoneE164Digits: '9876543210' },
      {
        kind: 'receipt',
        docLabel: 'Payment receipt',
        signedUrl: 'https://example.com/r.pdf',
        signedUrlValidDays: 3,
        fileName: 'receipt.pdf',
        unitCode: 'B-202'
      }
    );
    expect(text).toBe(
      'Dear Asha, download Payment receipt: https://example.com/r.pdf'
    );
  });
});

describe('getSmsAlertConfig', () => {
  afterEach(() => {
    delete process.env.SMS_API_KEY;
    delete process.env.SMS_SENDER;
    delete process.env.SMS_ALERT_HOSTNAME;
  });

  it('returns null without API key', () => {
    expect(getSmsAlertConfig()).toBeNull();
  });

  it('returns config when API key is set', () => {
    process.env.SMS_API_KEY = 'test-key';
    expect(getSmsAlertConfig()).toEqual({
      apiKey: 'test-key',
      sender: 'PKAEPL',
      hostname: 'www.smsalert.co.in'
    });
  });
});
