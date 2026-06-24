import { describe, expect, it } from 'vitest';
import { formatLocationFromAddress } from './reverse-geocode';

describe('formatLocationFromAddress', () => {
  it('prefers city and state', () => {
    expect(
      formatLocationFromAddress({ city: 'Pune', state: 'Maharashtra' })
    ).toBe('Pune, Maharashtra');
  });

  it('falls back to town or village', () => {
    expect(
      formatLocationFromAddress({ town: 'Thane', state: 'Maharashtra' })
    ).toBe('Thane, Maharashtra');
    expect(
      formatLocationFromAddress({ village: 'Karjat', state: 'Maharashtra' })
    ).toBe('Karjat, Maharashtra');
  });

  it('returns city alone when state is missing', () => {
    expect(formatLocationFromAddress({ city: 'Mumbai' })).toBe('Mumbai');
  });

  it('returns null when no locality parts exist', () => {
    expect(formatLocationFromAddress({})).toBeNull();
  });
});
