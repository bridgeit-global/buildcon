'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import type { SortingState } from '@tanstack/react-table';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resolveSortFromState, sortRowsByState } from '@/lib/crm/list-sort';
import { navigateToCreateBookingFromInquiry } from './booking-prefill-from-inquiry';
import {
  isInquiryClosed,
  negotiationApprovalBlockMessage
} from './inquiry-stage-transitions';
import type { InquiryRowDb, UnitLabelRow } from './inquiry-types';
import { embedOne, inquiryProjectLabel } from './inquiry-helpers';

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

export function useInquiryListResources(sorting: SortingState) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [units, setUnits] = useState<UnitLabelRow[]>([]);

  const loadInquiries = useCallback(async () => {
    setLoadingInquiries(true);
    const INQUIRY_DB_SORT: Record<string, string> = {
      ref: 'created_at',
      funnelStage: 'funnel_stage',
      leadSource: 'lead_source',
      unit: 'unit_id',
      seller: 'assigned_to'
    };
    const CLIENT_SORT = new Set(['customer', 'project']);
    const first = sorting[0];
    const { column, ascending } = resolveSortFromState(
      sorting,
      INQUIRY_DB_SORT,
      'created_at',
      false
    );

    let query = supabase.from('sales_inquiries').select(INQUIRY_SELECT).limit(500);
    if (first && CLIENT_SORT.has(first.id)) {
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order(column, { ascending });
    }

    const { data, error: qErr } = await query;

    if (qErr) {
      pageError(qErr.message);
      setInquiries([]);
    } else {
      let rows = (data ?? []) as unknown as InquiryRowDb[];
      if (first && CLIENT_SORT.has(first.id)) {
        rows = sortRowsByState(rows, sorting, (row, colId) => {
          if (colId === 'customer') {
            const c = embedOne(row.customers);
            return c?.full_name ?? '';
          }
          if (colId === 'project') return inquiryProjectLabel(row);
          return null;
        });
      }
      setInquiries(rows);
    }
    setLoadingInquiries(false);
  }, [supabase, sorting]);

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
      if (isInquiryClosed(inq.stage_data, inq.funnel_stage)) return;
      const pid = String(inq.project_id || '').trim();
      if (!pid || !String(inq.unit_id || '').trim()) return;
      const stageData = inq.stage_data as Record<string, unknown> | null | undefined;
      const negotiation =
        stageData &&
        typeof stageData === 'object' &&
        !Array.isArray(stageData)
          ? (stageData.negotiation as Record<string, unknown> | undefined)
          : undefined;
      const blockMsg = negotiationApprovalBlockMessage(negotiation, {
        funnelStage: inq.funnel_stage
      });
      if (blockMsg) {
        pageError(blockMsg);
        return;
      }
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
