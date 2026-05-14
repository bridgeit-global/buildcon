import type { ReactNode } from 'react';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { PortalNav } from './_components/portal-nav';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  if (!getSupabasePublicEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-sm">
        Supabase is not configured.
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 p-6">
        <p className="text-sm text-gray-700">Sign in to open the buyer portal.</p>
        <Link href="/login" className="text-sm font-semibold text-blue-700 underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-900">Buyer portal</span>
        </div>
      </header>
      <PortalNav />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
