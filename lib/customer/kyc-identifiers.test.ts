import { describe, expect, it } from 'vitest';
import {
  customerHasKycDocs,
  isAadhaarValid,
  isCustomerKycComplete,
  isPanPrefixValid,
  isPanValid,
  maskAadhaarLast4,
  normalizeAadhaar,
  normalizePan
} from './kyc-identifiers';

describe('normalizePan', () => {
  it('uppercases and strips non-alphanumeric', () => {
    expect(normalizePan(' abcd-e1234f ')).toBe('ABCDE1234F');
  });

  it('caps at 10 characters', () => {
    expect(normalizePan('ABCDE1234FEXTRA')).toBe('ABCDE1234F');
  });
});

describe('normalizeAadhaar', () => {
  it('keeps digits only up to 12', () => {
    expect(normalizeAadhaar('1234-5678-9012')).toBe('123456789012');
  });
});

describe('isPanValid', () => {
  it('accepts valid PAN format', () => {
    expect(isPanValid('ABCDE1234F')).toBe(true);
  });

  it('rejects invalid PAN format', () => {
    expect(isPanValid('ABCDE12345')).toBe(false);
  });
});

describe('isPanPrefixValid', () => {
  it('accepts partial valid prefix', () => {
    expect(isPanPrefixValid('ABCDE')).toBe(true);
  });

  it('rejects digit in letter section', () => {
    expect(isPanPrefixValid('ABCD1')).toBe(false);
  });
});

describe('isAadhaarValid', () => {
  it('requires 12 digits', () => {
    expect(isAadhaarValid('123456789012')).toBe(true);
    expect(isAadhaarValid('1234')).toBe(false);
  });
});

describe('customerHasKycDocs', () => {
  it('detects uploaded doc types case-insensitively', () => {
    expect(customerHasKycDocs(['PAN', 'Aadhaar', 'photo'])).toEqual({
      hasPanDoc: true,
      hasAadhaarDoc: true,
      hasPhotoDoc: true
    });
  });
});

describe('isCustomerKycComplete', () => {
  it('returns true when profile and docs are complete', () => {
    expect(
      isCustomerKycComplete('ABCDE1234F', '123456789012', [
        'pan',
        'aadhaar',
        'photo'
      ])
    ).toBe(true);
  });

  it('returns false when photo doc is missing', () => {
    expect(
      isCustomerKycComplete('ABCDE1234F', '123456789012', ['pan', 'aadhaar'])
    ).toBe(false);
  });
});

describe('maskAadhaarLast4', () => {
  it('masks full Aadhaar to last four digits', () => {
    expect(maskAadhaarLast4('123456789012')).toBe('XXXX-XXXX-9012');
  });

  it('returns dash for invalid value', () => {
    expect(maskAadhaarLast4('1234')).toBe('—');
  });
});
