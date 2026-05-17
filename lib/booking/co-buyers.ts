export type CoBuyerStored = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  relationship?: string | null;
};

function normalizePhone(p: string | null | undefined) {
  return String(p ?? '').replace(/\D/g, '');
}

import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveCoBuyers(
  admin: SupabaseClient,
  primaryCustomerId: string,
  primaryPhoneDigits: string,
  coBuyerIdsOrdered: string[],
  relationships?: Record<string, string>
): Promise<{ coBuyers: CoBuyerStored[]; error?: string }> {
  if (coBuyerIdsOrdered.length === 0) return { coBuyers: [] };

  const { data: coRows, error: coErr } = await admin
    .from('customers')
    .select('id,full_name,phone,email')
    .in('id', coBuyerIdsOrdered);
  if (coErr) return { coBuyers: [], error: coErr.message };
  if (!coRows || coRows.length !== coBuyerIdsOrdered.length) {
    return { coBuyers: [], error: 'One or more co-applicant customers were not found' };
  }

  const byId = new Map(coRows.map((r) => [r.id, r]));
  const usedCoPhones = new Set<string>();
  const coBuyers: CoBuyerStored[] = [];

  for (const id of coBuyerIdsOrdered) {
    const row = byId.get(id);
    if (!row) {
      return { coBuyers: [], error: 'One or more co-applicant customers were not found' };
    }
    const p = normalizePhone(row.phone);
    if (p && primaryPhoneDigits && p === primaryPhoneDigits) {
      return {
        coBuyers: [],
        error: 'A co-applicant cannot use the same phone number as the primary customer'
      };
    }
    if (p) {
      if (usedCoPhones.has(p)) {
        return { coBuyers: [], error: 'Co-applicants cannot share the same phone number' };
      }
      usedCoPhones.add(p);
    }
    coBuyers.push({
      customer_id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
      relationship: relationships?.[id]?.trim() || null
    });
  }

  return { coBuyers };
}
