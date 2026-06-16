import { describe, expect, it } from 'vitest';
import {
  embedOne,
  inquiryProjectLabel,
  inquiryReference,
  inquiryUnitLabelFromRow,
  normalizeLeadSource,
  unitDisplayName
} from './inquiry-helpers';

describe('embedOne', () => {
  it('returns null for nullish input', () => {
    expect(embedOne(null)).toBeNull();
    expect(embedOne(undefined)).toBeNull();
  });

  it('returns first element of array', () => {
    expect(embedOne([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
    expect(embedOne([])).toBeNull();
  });

  it('returns scalar as-is', () => {
    expect(embedOne({ id: 1 })).toEqual({ id: 1 });
  });
});

describe('unitDisplayName', () => {
  it('includes project name when present', () => {
    expect(
      unitDisplayName({
        project_name: 'Sunrise Towers',
        unit_code: '101',
        wing_name: 'A'
      })
    ).toBe('Sunrise Towers · 101 · A');
  });

  it('omits project when absent', () => {
    expect(
      unitDisplayName({ unit_code: '101', wing_name: 'A', project_name: '' })
    ).toBe('101 · A');
  });
});

describe('inquiryProjectLabel', () => {
  it('returns project name from embedded join', () => {
    expect(inquiryProjectLabel({ projects: { name: 'Green Valley' } })).toBe(
      'Green Valley'
    );
  });

  it('returns empty string when project is missing', () => {
    expect(inquiryProjectLabel({ projects: null })).toBe('');
  });
});

describe('inquiryUnitLabelFromRow', () => {
  it('returns em dash when unit is missing', () => {
    expect(inquiryUnitLabelFromRow({ unit_id: null, units: null })).toBe('—');
  });

  it('formats unit with project name', () => {
    expect(
      inquiryUnitLabelFromRow({
        unit_id: 'u1',
        units: {
          unit_code: '202',
          wing_name: 'B',
          projects: { name: 'Lake View' }
        }
      })
    ).toBe('Lake View · 202 · B');
  });
});

describe('inquiryReference', () => {
  it('builds INQ prefix from uuid', () => {
    expect(inquiryReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'INQ-A1B2C3D4E5'
    );
  });
});

describe('normalizeLeadSource', () => {
  it('normalizes walk-in to Direct', () => {
    expect(normalizeLeadSource('walk-in')).toBe('Direct');
    expect(normalizeLeadSource('Walk In')).toBe('Direct');
  });

  it('returns Unknown for empty source', () => {
    expect(normalizeLeadSource('')).toBe('Unknown');
  });

  it('preserves other sources', () => {
    expect(normalizeLeadSource('Referral')).toBe('Referral');
  });
});
