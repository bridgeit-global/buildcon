import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from './env';

export function createSupabaseBrowserClient() {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  return createBrowserClient(env.url, env.publishableKey);
}

