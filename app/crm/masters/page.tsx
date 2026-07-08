'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isOrgAdmin } from '@/lib/profile-roles';
import {
  MASTER_LOOKUP_KINDS,
  MASTER_LOOKUP_KIND_LABELS,
  type MasterLookupKind
} from '@/lib/master/master-lookup';
import { MasterLookupPanel } from './master-lookup-panel';
import { CrmFormSkeleton } from '../_components/crm-skeletons';
import { cn } from '@/lib/utils';

export default function MastersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [activeKind, setActiveKind] = useState<MasterLookupKind>('lead_source');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/crm/dashboard');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && !isOrgAdmin(profile?.role)) {
        router.replace('/crm/dashboard');
        return;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  if (loading) {
    return <CrmFormSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ds-gray-900">Master data</h2>
        <p className="mt-1 text-xs text-ds-gray-500">
          Manage lead sources, unit types, unit categories, and customer relations
          used in leads, inventory, project setup, and application forms. Inactive
          items stay on old records but disappear from dropdowns.
        </p>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Master data categories"
        >
          {MASTER_LOOKUP_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={activeKind === kind}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                activeKind === kind
                  ? 'bg-ds-primary-500 text-white'
                  : 'bg-ds-gray-100 text-ds-gray-700 hover:bg-ds-gray-200'
              )}
              onClick={() => setActiveKind(kind)}
            >
              {MASTER_LOOKUP_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <MasterLookupPanel key={activeKind} kind={activeKind} />
    </div>
  );
}
