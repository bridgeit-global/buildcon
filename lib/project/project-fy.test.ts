import { describe, expect, it } from 'vitest';
import {
  coerceProjectFy,
  formatIndianFy,
  indianFyStartYear,
  projectFyOptions
} from './project-fy';

const june2026 = new Date(2026, 5, 24);

describe('indianFyStartYear', () => {
  it('uses calendar year from April onward', () => {
    expect(indianFyStartYear(new Date(2026, 3, 1))).toBe(2026);
  });

  it('uses previous calendar year before April', () => {
    expect(indianFyStartYear(new Date(2026, 2, 31))).toBe(2025);
  });
});

describe('formatIndianFy', () => {
  it('formats two-digit end year', () => {
    expect(formatIndianFy(2026)).toBe('2026-27');
    expect(formatIndianFy(1999)).toBe('1999-00');
  });
});

describe('projectFyOptions', () => {
  it('offers past and current years for Ready projects', () => {
    const options = projectFyOptions('Ready', { span: 2, now: june2026 });
    expect(options).toEqual(['2026-27', '2025-26', '2024-25']);
    expect(options).not.toContain('2027-28');
  });

  it('offers current and future years for development projects', () => {
    const options = projectFyOptions('Greenfield', { span: 2, now: june2026 });
    expect(options).toEqual(['2026-27', '2027-28', '2028-29']);
    expect(options).not.toContain('2025-26');
  });

  it('keeps an out-of-range saved value when editing', () => {
    const options = projectFyOptions('Ready', {
      span: 1,
      now: june2026,
      includeFy: '2030-31'
    });
    expect(options).toContain('2030-31');
  });
});

describe('coerceProjectFy', () => {
  it('keeps a valid fy for the type', () => {
    expect(coerceProjectFy('Ready', '2025-26', { span: 2, now: june2026 })).toBe(
      '2025-26'
    );
  });

  it('replaces an invalid fy when type changes', () => {
    expect(coerceProjectFy('Ready', '2028-29', { span: 2, now: june2026 })).toBe(
      '2026-27'
    );
    expect(
      coerceProjectFy('Greenfield', '2024-25', { span: 2, now: june2026 })
    ).toBe('2026-27');
  });
});
