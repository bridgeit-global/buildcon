export const DEFAULT_DEVELOPER_TRADE_NAME = 'BuildCon';

export type OrganizationSettings = {
  id: string;
  legal_name: string;
  trade_name: string;
  registered_address: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  pan: string | null;
  gstin: string | null;
  cin: string | null;
  rera_promoter_no: string | null;
  authorized_signatory_name: string | null;
  logo_storage_path: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

/** Brand / trade name used on letters, receipts, and agreements. */
export function resolveDeveloperTradeName(
  tradeName?: string | null
): string {
  const t = String(tradeName ?? '').trim();
  return t || DEFAULT_DEVELOPER_TRADE_NAME;
}

/** Legal entity name; falls back to trade name then default. */
export function resolveDeveloperLegalName(
  legalName?: string | null,
  tradeName?: string | null
): string {
  const legal = String(legalName ?? '').trim();
  if (legal) return legal;
  return resolveDeveloperTradeName(tradeName);
}

export function formatOrganizationAddress(org: {
  registered_address?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
}): string {
  const parts = [
    String(org.registered_address ?? '').trim(),
    [org.city, org.state].map((x) => String(x ?? '').trim()).filter(Boolean).join(', '),
    String(org.pin ?? '').trim()
  ].filter(Boolean);
  return parts.join(' · ');
}
