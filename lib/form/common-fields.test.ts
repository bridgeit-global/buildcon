import { describe, expect, it } from 'vitest';
import {
  customerNameMin2,
  nonNegativeNumberString,
  normalizePhoneDigits,
  optionalEmail,
  optionalPhone10,
  optionalUuid,
  phone10,
  positiveNumberString,
  requiredEmail,
  requiredUuid
} from './common-fields';

describe('normalizePhoneDigits', () => {
  it('strips non-digit characters', () => {
    expect(normalizePhoneDigits('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhoneDigits(null)).toBe('');
  });
});

describe('optionalEmail', () => {
  it('accepts empty or valid email', () => {
    expect(optionalEmail.safeParse('').success).toBe(true);
    expect(optionalEmail.safeParse('  ').success).toBe(true);
    expect(optionalEmail.safeParse('user@example.com').success).toBe(true);
    expect(optionalEmail.safeParse('bad-email').success).toBe(false);
  });
});

describe('requiredEmail', () => {
  it('requires a valid email', () => {
    expect(requiredEmail.safeParse('').success).toBe(false);
    expect(requiredEmail.safeParse('user@example.com').success).toBe(true);
  });
});

describe('phone10', () => {
  it('requires exactly 10 digits after normalization', () => {
    expect(phone10.safeParse('9876543210').success).toBe(true);
    expect(phone10.safeParse('987654321').success).toBe(false);
  });
});

describe('optionalPhone10', () => {
  it('allows empty or 10-digit phone', () => {
    expect(optionalPhone10.safeParse('').success).toBe(true);
    expect(optionalPhone10.safeParse('9876543210').success).toBe(true);
    expect(optionalPhone10.safeParse('123').success).toBe(false);
  });
});

describe('customerNameMin2', () => {
  it('requires at least two characters', () => {
    expect(customerNameMin2.safeParse('Jo').success).toBe(true);
    expect(customerNameMin2.safeParse('J').success).toBe(false);
  });
});

describe('positiveNumberString', () => {
  it('accepts comma-formatted positive amounts', () => {
    const schema = positiveNumberString('booking amount');
    expect(schema.safeParse('1,00,000').success).toBe(true);
    expect(schema.safeParse('0').success).toBe(false);
    expect(schema.safeParse('-5').success).toBe(false);
  });
});

describe('nonNegativeNumberString', () => {
  it('accepts zero and positive numbers', () => {
    expect(nonNegativeNumberString.safeParse('0').success).toBe(true);
    expect(nonNegativeNumberString.safeParse('12,500').success).toBe(true);
    expect(nonNegativeNumberString.safeParse('-1').success).toBe(false);
  });
});

describe('optionalUuid', () => {
  it('allows empty or valid UUID v4', () => {
    expect(optionalUuid.safeParse('').success).toBe(true);
    expect(optionalUuid.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(optionalUuid.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('requiredUuid', () => {
  it('requires a valid UUID', () => {
    expect(requiredUuid.safeParse('').success).toBe(false);
    expect(requiredUuid.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });
});
