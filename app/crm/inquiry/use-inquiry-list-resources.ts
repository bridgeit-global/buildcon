'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { writeBookingPrefill } from '../booking-prefill-storage';
import { inquiryReference } from './inquiry-helpers';
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
  parking_required,
  parking_count,
  parking_slots_available,
  parking_rate_snapshot,
  notes,
  customer_id,
  unit_id,
  customers ( full_name, phone, email ),
  units ( unit_code, wing_name, project_id, projects ( name ) ),
  profiles ( name ),
  sales_opportunities (
    id,
    funnel_stage,
    assigned_to,
    sales_pipeline_stages ( id, stage, payload, updated_at ),
    sales_follow_ups ( id, due_at, note, completed_at ),
    sales_site_visits ( id, scheduled_at, status, outcome )
  )
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
  const [error, setError] = useState('');

  const loadInquiries = useCallback(async () => {
    setLoadingInquiries(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(INQUIRY_SELECT)
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      setError(qErr.message);
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
      writeBookingPrefill({
        projectId: pid,
        inquiryId: inq.id,
        inquiryRef: inquiryReference(inq.id),
        customerId: inq.customer_id,
        unitId: inq.unit_id,
        parkingRequired: inq.parking_required === 'Yes' ? 'Yes' : 'No',
        parkingCount: inq.parking_count,
        parkingSlotsAvailable: inq.parking_slots_available,
        parkingRateSnapshot: inq.parking_rate_snapshot
      });
      router.push('/crm/bookings');
    },
    [router]
  );

  return {
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    error,
    navigateToBookingFromInquiry
  };
}
