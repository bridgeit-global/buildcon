import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  datetimeLocalValue,
  datetimeLocalValueNextWeek,
  isIsoDateNotAfterToday,
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
