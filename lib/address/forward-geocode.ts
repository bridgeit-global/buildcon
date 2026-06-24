import {
  formatLocationFromAddress,
  type NominatimAddress
} from './reverse-geocode';

export type LocationSearchResult = {
  /** Short value stored on the project, e.g. "Pune, Maharashtra". */
  location: string;
  /** Full label shown in the search dropdown. */
  label: string;
};

type NominatimSearchRow = {
  display_name?: string;
  address?: NominatimAddress;
};

/** Pick a stored location string from a Nominatim search row. */
export function formatLocationFromSearchRow(
  row: NominatimSearchRow
): LocationSearchResult | null {
  const label = row.display_name?.trim();
  if (!label) return null;

  const location =
    (row.address ? formatLocationFromAddress(row.address) : null) ?? label;

  return { location, label };
}

/**
 * Forward-geocode a free-text query via OpenStreetMap Nominatim.
 * Biased to India (`countrycodes=in`) for CRM project locations.
 */
export async function searchLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('countrycodes', 'in');

  try {
    const res = await fetch(url.toString(), {
      signal: signal ?? AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BuildconCRM/1.0 (project location search)'
      }
    });
    if (!res.ok) return [];

    const rows = (await res.json()) as NominatimSearchRow[];
    if (!Array.isArray(rows)) return [];

    const seen = new Set<string>();
    const results: LocationSearchResult[] = [];
    for (const row of rows) {
      const formatted = formatLocationFromSearchRow(row);
      if (!formatted) continue;
      const key = formatted.location.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(formatted);
    }
    return results;
  } catch {
    return [];
  }
}
