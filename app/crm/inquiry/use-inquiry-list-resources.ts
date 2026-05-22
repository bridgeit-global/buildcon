'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { navigateToCreateBookingFromInquiry } from './booking-prefill-from-inquiry';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';

const INQUIRY_SELECT = `
  id,
  project_id,
  projects ( name ),
  created_at,
  lead_source,
  broker_id,
  brokers ( full_name ),
  interested_in,
  notes,
  funnel_stage,
  assigned_to,
  stage_data,
  customer_id,
  unit_id,
  customers ( full_name, phone, email ),
  units ( unit_code, wing_name, project_id, projects ( name ) ),
  profiles ( name )
`;

function mapUnitLabelFromDb(row: Record<string, unknown>): UnitLabelRow {
  const pr = row.projects as { name?: unknown } | null | undefined;
  const project_name =
    pr && typeof pr === 'object' && pr !== null && 'name' in pr
      ? String((pr as { name: unknown }).name ?? '').trim() || null
      : null;
  const { projects: _drop, ...rest } = row;
  return {
    ...(rest as Pick<
      UnitLabelRow,
      'id' | 'unit_code' | 'wing_name' | 'project_id'
    >),
    project_name
  };
}

export function useInquiryListResources() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [units, setUnits] = useState<UnitLabelRow[]>([]);

  const loadInquiries = useCallback(async () => {
    setLoadingInquiries(true);
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(INQUIRY_SELECT)
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      pageError(qErr.message);
      setInquiries([]);
    } else {
      setInquiries((data ?? []) as unknown as InquiryRowDb[]);
    }
    setLoadingInquiries(false);
  }, [supabase]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: uErr } = await supabase
        .from('units')
        .select('id, unit_code, wing_name, project_id, projects(name)')
        .order('project_id', { ascending: true })
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(2000);
      if (!cancelled && !uErr) {
        const raw = (data ?? []) as Record<string, unknown>[];
        setUnits(raw.map(mapUnitLabelFromDb));
      } else if (!cancelled) {
        setUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const navigateToBookingFromInquiry = useCallback(
    (inq: InquiryRowDb) => {
      const pid = String(inq.project_id || '').trim();
      if (!pid || !String(inq.unit_id || '').trim()) return;
      navigateToCreateBookingFromInquiry(router, {
        inquiryId: inq.id,
        projectId: pid,
        customerId: inq.customer_id,
        unitId: inq.unit_id,
        stageData: inq.stage_data
      });
    },
    [router]
  );

  return {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    navigateToBookingFromInquiry
  };
}
