import { describe, expect, it } from 'vitest';
import { formatLocationFromSearchRow } from './forward-geocode';

describe('formatLocationFromSearchRow', () => {
  it('uses city/state for stored location and keeps display_name as label', () => {
    expect(
      formatLocationFromSearchRow({
        display_name: 'Pune, Pune District, Maharashtra, India',
        address: { city: 'Pune', state: 'Maharashtra' }
      })
    ).toEqual({
      location: 'Pune, Maharashtra',
      label: 'Pune, Pune District, Maharashtra, India'
    });
  });

  it('falls back to display_name when address parts are missing', () => {
    expect(
      formatLocationFromSearchRow({
        display_name: 'Some Place, India'
      })
    ).toEqual({
      location: 'Some Place, India',
      label: 'Some Place, India'
    });
  });

  it('returns null without display_name', () => {
    expect(formatLocationFromSearchRow({ address: { city: 'Pune' } })).toBeNull();
  });
});
