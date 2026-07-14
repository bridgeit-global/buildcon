import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_DEVELOPER_TRADE_NAME,
  type OrganizationSettings
} from './organization-settings';

/** Loads the singleton org profile. Returns null when the table is empty / unavailable. */
export async function fetchOrganizationSettings(
  supabase: SupabaseClient
): Promise<OrganizationSettings | null> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrganizationSettings;
}

export async function fetchDeveloperTradeName(
  supabase: SupabaseClient
): Promise<string> {
  const org = await fetchOrganizationSettings(supabase);
  const name = String(org?.trade_name ?? '').trim();
  return name || DEFAULT_DEVELOPER_TRADE_NAME;
}
