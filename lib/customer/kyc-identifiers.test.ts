import { describe, expect, it } from 'vitest';
import {
  customerHasKycDocs,
  isAadhaarValid,
  isCustomerKycComplete,
  isForeignPassportValid,
  isIndianPassportValid,
  isPanPrefixValid,
  isPanValid,
  isPassportPrefixValid,
  isPassportValid,
  maskAadhaarLast4,
  normalizeAadhaar,
  normalizePan,
  normalizePassport
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

describe('normalizePassport', () => {
  it('uppercases and strips non-alphanumeric', () => {
    expect(normalizePassport(' k-1234567 ')).toBe('K1234567');
  });

  it('caps at 12 characters', () => {
    expect(normalizePassport('ABCD1234567890EXTRA')).toBe('ABCD12345678');
  });
});

describe('isIndianPassportValid', () => {
  it('accepts letter + 7 digits', () => {
    expect(isIndianPassportValid('K1234567')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isIndianPassportValid('K123456')).toBe(false);
    expect(isIndianPassportValid('12345678')).toBe(false);
  });
});

describe('isForeignPassportValid', () => {
  it('accepts 6–12 alphanumeric characters', () => {
    expect(isForeignPassportValid('AB12CD')).toBe(true);
    expect(isForeignPassportValid('ABCD12345678')).toBe(true);
  });

  it('rejects too short values', () => {
    expect(isForeignPassportValid('AB12')).toBe(false);
  });
});

describe('isPassportValid', () => {
  it('validates NRI passports strictly', () => {
    expect(isPassportValid('K1234567', 'NRI')).toBe(true);
    expect(isPassportValid('AB12CD', 'NRI')).toBe(false);
  });

  it('validates foreign passports leniently', () => {
    expect(isPassportValid('AB12CD', 'Foreign National')).toBe(true);
    expect(isPassportValid('K1234567', 'Foreign National')).toBe(true);
  });
});

describe('isPassportPrefixValid', () => {
  it('accepts partial valid NRI prefix', () => {
    expect(isPassportPrefixValid('K12', 'NRI')).toBe(true);
  });

  it('rejects digit as first NRI character', () => {
    expect(isPassportPrefixValid('1K234567', 'NRI')).toBe(false);
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
