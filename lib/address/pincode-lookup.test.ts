import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INDIAN_STATES, lookupPincode } from './pincode-lookup';

describe('INDIAN_STATES', () => {
  it('includes union territories and normalizes Odisha spelling', () => {
    expect(INDIAN_STATES).toContain('Odisha');
    expect(INDIAN_STATES).toContain('Delhi');
    expect(INDIAN_STATES).toContain('Puducherry');
  });
});

describe('lookupPincode', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/411001')) {
          return {
            ok: true,
            json: async () => [
              {
                Status: 'Success',
                PostOffice: [
                  {
                    Name: 'Camp',
                    District: 'Pune',
                    State: 'Maharashtra'
                  },
                  {
                    Name: 'Shivajinagar',
                    District: 'Pune',
                    State: 'Maharashtra'
                  }
                ]
              }
            ]
          };
        }
        if (url.includes('/000000')) {
          return {
            ok: true,
            json: async () => [{ Status: 'Error', PostOffice: [] }]
          };
        }
        return { ok: false, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null for invalid pin length', async () => {
    expect(await lookupPincode('41100')).toBeNull();
    expect(await lookupPincode('4110012')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('strips non-digits before lookup', async () => {
    const result = await lookupPincode('411 001');
    expect(result).toEqual({
      city: 'Pune',
      state: 'Maharashtra',
      postOffices: ['Camp', 'Shivajinagar']
    });
  });

  it('normalizes legacy state names from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            Status: 'Success',
            PostOffice: [{ Name: 'Pondy', District: 'Puducherry', State: 'Pondicherry' }]
          }
        ]
      }))
    );
    expect(await lookupPincode('605001')).toEqual({
      city: 'Puducherry',
      state: 'Puducherry',
      postOffices: ['Pondy']
    });
  });

  it('returns null when API fails or has no offices', async () => {
    expect(await lookupPincode('000000')).toBeNull();
    expect(await lookupPincode('999999')).toBeNull();
  });
});
