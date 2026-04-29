import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from './env';

export function createSupabaseAdminClient() {
  const env = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(env.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

