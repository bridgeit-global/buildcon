'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { writeBookingPrefill } from '../booking-prefill-storage';
import { inquiryReference } from './inquiry-helpers';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';

const INQUIRY_SELECT = `
  id,
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
  units ( unit_code, wing_name ),
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

export function useInquiryListResources() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [units, setUnits] = useState<UnitLabelRow[]>([]);
  const [error, setError] = useState('');

  const loadInquiries = useCallback(async () => {
    if (!activeProjectId) return;
    setLoadingInquiries(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(INQUIRY_SELECT)
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      setError(qErr.message);
      setInquiries([]);
    } else {
      setInquiries((data ?? []) as unknown as InquiryRowDb[]);
    }
    setLoadingInquiries(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    if (!activeProjectId) {
      setUnits([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: uErr } = await supabase
        .from('units')
        .select('id, unit_code, wing_name')
        .eq('project_id', activeProjectId)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(500);
      if (!cancelled && !uErr) {
        setUnits((data ?? []) as UnitLabelRow[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, supabase]);

  const navigateToBookingFromInquiry = useCallback(
    (inq: InquiryRowDb) => {
      if (!activeProjectId || !String(inq.unit_id || '').trim()) return;
      writeBookingPrefill({
        projectId: activeProjectId,
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
    [activeProjectId, router]
  );

  return {
    activeProjectId,
    inquiries,
    loadingInquiries,
    loadInquiries,
    units,
    error,
    navigateToBookingFromInquiry
  };
}
