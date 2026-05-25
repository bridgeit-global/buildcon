export type PincodeLookupResult = {
  city: string;
  state: string;
  postOffices: string[];
};

/**
 * Fetches city and state for a 6-digit Indian PIN code using the
 * India Post public API (api.postalpincode.in).
 * Returns null when the pin is invalid or the API fails.
 */
export async function lookupPincode(
  pin: string
): Promise<PincodeLookupResult | null> {
  const cleaned = pin.replace(/\D/g, '');
  if (cleaned.length !== 6) return null;

  try {
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${cleaned}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const entry = data?.[0];
    if (entry?.Status !== 'Success' || !entry.PostOffice?.length) return null;

    const offices: Array<{ Name: string; District: string; State: string }> =
      entry.PostOffice;

    return {
      city: offices[0].District,
      state: offices[0].State,
      postOffices: offices.map((o) => o.Name)
    };
  } catch {
    return null;
  }
}

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
] as const;
