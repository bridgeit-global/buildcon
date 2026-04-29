import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { CrmShell } from './_components/crm-shell';
import type { CrmProject } from './_components/types';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: ReactNode }) {
  if (!getSupabasePublicEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-lg rounded-xl border bg-white p-6 text-sm">
          <div className="text-base font-semibold text-gray-900">
            Supabase is not configured
          </div>
          <div className="mt-2 text-gray-600">
            Set `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then restart
            the dev server.
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Middleware should already enforce auth, but keep this layout resilient.
  const userEmail = user?.email ?? null;

  const { data: projects } = await supabase
    .from('projects')
    .select(
      'id,name,location,type,status,fy,rera_no,floors_per_wing,units_per_floor,base_rate,min_rate,max_rate'
    )
    .order('created_at', { ascending: false });

  return (
    <CrmShell
      userEmail={userEmail}
      projects={(projects ?? []) as CrmProject[]}
    >
      {children}
    </CrmShell>
  );
}

