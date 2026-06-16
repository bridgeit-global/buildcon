import { describe, expect, it } from 'vitest';
import { formatDisplayDate, formatDisplayDateTime } from './format-display-date';

describe('formatDisplayDate', () => {
  it('formats ISO date strings as dd-mm-yyyy', () => {
    expect(formatDisplayDate('2026-03-15')).toBe('15-03-2026');
  });

  it('formats Date objects', () => {
    expect(formatDisplayDate(new Date('2026-01-05T00:00:00'))).toMatch(/05-01-2026/);
  });

  it('returns em dash for empty or invalid values', () => {
    expect(formatDisplayDate(null)).toBe('—');
    expect(formatDisplayDate('')).toBe('—');
    expect(formatDisplayDate('invalid')).toBe('—');
  });
});

describe('formatDisplayDateTime', () => {
  it('appends local time to the display date', () => {
    const value = formatDisplayDateTime('2026-06-15T14:30:00');
    expect(value).toMatch(/^15-06-2026, \d{2}:\d{2}$/);
  });

  it('returns em dash for empty input', () => {
    expect(formatDisplayDateTime(undefined)).toBe('—');
  });
});
