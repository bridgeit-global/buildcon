import { describe, expect, it } from 'vitest';
import {
  formatInrAmountInputDisplay,
  parseInrAmountInput,
  sanitizeInrAmountInput
} from './inr-amount-input';

describe('sanitizeInrAmountInput', () => {
  it('keeps digits and a single decimal with up to two places', () => {
    expect(sanitizeInrAmountInput('12,34,567.89')).toBe('1234567.89');
    expect(sanitizeInrAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeInrAmountInput('abc')).toBe('');
    expect(sanitizeInrAmountInput('.5')).toBe('0.5');
  });
});

describe('formatInrAmountInputDisplay', () => {
  it('formats integers with Indian grouping', () => {
    expect(formatInrAmountInputDisplay('1234567')).toBe('12,34,567');
  });

  it('preserves decimal part', () => {
    expect(formatInrAmountInputDisplay('1234567.5')).toBe('12,34,567.5');
  });

  it('returns empty string for empty input', () => {
    expect(formatInrAmountInputDisplay('')).toBe('');
  });
});

describe('parseInrAmountInput', () => {
  it('parses sanitized amount strings', () => {
    expect(parseInrAmountInput('12,34,567')).toBe(1234567);
    expect(parseInrAmountInput('1,000.25')).toBe(1000.25);
  });

  it('returns NaN for empty input', () => {
    expect(Number.isNaN(parseInrAmountInput(''))).toBe(true);
  });
});
