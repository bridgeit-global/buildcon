import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ageFromDobIso,
  datetimeLocalValue,
  datetimeLocalValueNextWeek,
  dobDayOptions,
  dobPartsFromIso,
  dobYearOptions,
  isIsoDateNotAfterToday,
  isValidDobIso,
  isoFromDobParts,
  nextWeekIsoDate,
  todayIsoDate,
  withDateInputDefault
} from './date-input-value';

afterEach(() => {
  vi.useRealTimers();
});

describe('todayIsoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('returns local YYYY-MM-DD', () => {
    expect(todayIsoDate()).toBe('2026-06-15');
  });
});

describe('datetimeLocalValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('returns local datetime-local value', () => {
    expect(datetimeLocalValue()).toBe('2026-06-15T10:30');
  });
});

describe('datetimeLocalValueNextWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('returns datetime one week later', () => {
    expect(datetimeLocalValueNextWeek()).toBe('2026-06-22T10:30');
  });
});

describe('nextWeekIsoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('returns ISO date one week later', () => {
    expect(nextWeekIsoDate()).toBe('2026-06-22');
  });
});

describe('withDateInputDefault', () => {
  it('returns fallback when value is blank', () => {
    expect(withDateInputDefault(null, '2026-01-01')).toBe('2026-01-01');
    expect(withDateInputDefault('  ', '2026-01-01')).toBe('2026-01-01');
  });

  it('returns trimmed value when present', () => {
    expect(withDateInputDefault(' 2026-03-10 ', '2026-01-01')).toBe('2026-03-10');
  });
});

describe('isIsoDateNotAfterToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('accepts empty values', () => {
    expect(isIsoDateNotAfterToday('')).toBe(true);
    expect(isIsoDateNotAfterToday('  ')).toBe(true);
  });

  it('accepts today and past dates', () => {
    expect(isIsoDateNotAfterToday('2026-06-15')).toBe(true);
    expect(isIsoDateNotAfterToday('1990-01-01')).toBe(true);
  });

  it('rejects future dates', () => {
    expect(isIsoDateNotAfterToday('2026-06-16')).toBe(false);
  });
});

describe('dobPartsFromIso / isoFromDobParts', () => {
  it('round-trips ISO dates', () => {
    expect(dobPartsFromIso('1990-05-15')).toEqual({
      day: '15',
      month: '05',
      year: '1990'
    });
    expect(
      isoFromDobParts({ day: '15', month: '05', year: '1990' })
    ).toBe('1990-05-15');
  });
});

describe('isValidDobIso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('rejects invalid calendar dates', () => {
    expect(isValidDobIso('1990-02-31')).toBe(false);
  });

  it('accepts valid past dates', () => {
    expect(isValidDobIso('1990-05-15')).toBe(true);
  });
});

describe('dobDayOptions', () => {
  it('returns 29 days for Feb 2024', () => {
    expect(dobDayOptions('2024', '02')).toHaveLength(29);
  });
});

describe('ageFromDobIso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('returns completed years for a valid DOB', () => {
    expect(ageFromDobIso('1990-05-15')).toBe(36);
    expect(ageFromDobIso('1990-07-01')).toBe(35);
  });

  it('returns null for invalid or future DOB', () => {
    expect(ageFromDobIso('')).toBeNull();
    expect(ageFromDobIso('2030-01-01')).toBeNull();
  });
});

describe('dobYearOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:30:00'));
  });

  it('includes current year and 1900', () => {
    const years = dobYearOptions();
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(1900);
  });
});
