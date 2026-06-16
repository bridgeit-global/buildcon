import { describe, expect, it } from 'vitest';
import {
  followUpDueState,
  followUpNeedsAttention
} from '@/lib/inquiry/follow-up-due';

const noon = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 12, 0, 0);

describe('followUpDueState', () => {
  const now = noon(2026, 6, 16);

  it('returns invalid for empty or unparseable dates', () => {
    expect(followUpDueState('', now)).toBe('invalid');
    expect(followUpDueState('not-a-date', now)).toBe('invalid');
  });

  it('returns overdue before start of today', () => {
    expect(followUpDueState('2026-06-15T23:59:59', now)).toBe('overdue');
  });

  it('returns today for datetimes on the current day', () => {
    expect(followUpDueState('2026-06-16T08:00:00', now)).toBe('today');
    expect(followUpDueState('2026-06-16T23:59:59', now)).toBe('today');
  });

  it('returns upcoming for future dates', () => {
    expect(followUpDueState('2026-06-17T00:00:00', now)).toBe('upcoming');
  });
});

describe('followUpNeedsAttention', () => {
  const now = noon(2026, 6, 16);

  it('is true for overdue and today', () => {
    expect(followUpNeedsAttention('2026-06-15', now)).toBe(true);
    expect(followUpNeedsAttention('2026-06-16T09:00:00', now)).toBe(true);
  });

  it('is false for upcoming or invalid', () => {
    expect(followUpNeedsAttention('2026-06-20', now)).toBe(false);
    expect(followUpNeedsAttention('', now)).toBe(false);
  });
});
