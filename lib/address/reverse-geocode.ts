export type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  county?: string;
  state_district?: string;
  state?: string;
  country?: string;
};

/** Format Nominatim address parts as "City, State" (India-focused). */
export function formatLocationFromAddress(address: NominatimAddress): string | null {
  const city =
    address.city?.trim() ||
    address.town?.trim() ||
    address.village?.trim() ||
    address.suburb?.trim() ||
    address.county?.trim() ||
    address.state_district?.trim() ||
    '';

  const state = address.state?.trim() || '';

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return null;
}

export type ReverseGeocodeResult = {
  location: string;
};

/**
 * Reverse-geocode coordinates via OpenStreetMap Nominatim.
 * Returns null when lookup fails or yields no usable locality.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '14');

  try {
    const res = await fetch(url.toString(), {
      signal: signal ?? AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BuildconCRM/1.0 (project location lookup)'
      }
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { address?: NominatimAddress };
    const location = data.address
      ? formatLocationFromAddress(data.address)
      : null;
    if (!location) return null;

    return { location };
  } catch {
    return null;
  }
}
