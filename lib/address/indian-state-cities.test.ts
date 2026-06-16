import { describe, expect, it } from 'vitest';
import { INDIAN_STATE_CITIES, getCitiesForState } from './indian-state-cities';

describe('INDIAN_STATE_CITIES', () => {
  it('includes major states with city lists', () => {
    expect(INDIAN_STATE_CITIES['Maharashtra']).toContain('Mumbai');
    expect(INDIAN_STATE_CITIES['Karnataka']).toContain('Bengaluru');
  });
});

describe('getCitiesForState', () => {
  it('returns sorted cities for a known state', () => {
    const cities = getCitiesForState('Maharashtra');
    expect(cities).toContain('Mumbai');
    expect(cities).toContain('Pune');
    expect([...cities]).toEqual([...cities].sort());
  });

  it('returns empty array for unknown state', () => {
    expect(getCitiesForState('Unknown State')).toEqual([]);
  });

  it('does not mutate the source list', () => {
    const first = getCitiesForState('Goa');
    first.push('Test City');
    expect(getCitiesForState('Goa')).not.toContain('Test City');
  });
});
