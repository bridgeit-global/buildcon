import { describe, expect, it } from 'vitest';
import { normalizeLeadSource } from './lead-source';

describe('normalizeLeadSource', () => {
  it('returns Unknown for empty source', () => {
    expect(normalizeLeadSource('')).toBe('Unknown');
    expect(normalizeLeadSource('   ')).toBe('Unknown');
  });

  it('maps walk-in variants to Direct', () => {
    expect(normalizeLeadSource('walk-in')).toBe('Direct');
    expect(normalizeLeadSource('Walk In')).toBe('Direct');
    expect(normalizeLeadSource('WALK  IN')).toBe('Direct');
  });

  it('preserves other sources', () => {
    expect(normalizeLeadSource('Broker')).toBe('Broker');
    expect(normalizeLeadSource('  Website  ')).toBe('Website');
  });
});
