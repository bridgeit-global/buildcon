import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import type { InquiryFunnelStage } from './inquiry-stage-unit-map';

export const SITE_VISIT_OUTCOMES = [
  'Liked',
  'Need Another Visit',
  'Undecided',
  'Disliked'
] as const;

export type SiteVisitOutcome = (typeof SITE_VISIT_OUTCOMES)[number];

export type QualifiedStagePayload = {
  budget_min?: string;
  budget_max?: string;
  financing?: string;
  temperature?: string;
  follow_up_date?: string;
  notes?: string;
};

/** Inventory status to apply when `funnel_stage` changes (app + DB mirror). */
export function targetUnitStatusForFunnelStage(
  funnelStage: string,
  currentUnitStatus: string | null | undefined
): string | null {
  const fs = String(funnelStage || '').trim();
  const s = normalizeUnitStatusCode(currentUnitStatus);

  if (fs === 'Qualified') {
    if (isUnitAvailableForBooking(currentUnitStatus)) return 'BLOCKED';
    return null;
  }

  if (fs === 'Token') {
    if (
      isUnitAvailableForBooking(currentUnitStatus) ||
      isUnitBlockedStatus(currentUnitStatus)
    ) {
      return 'TOKEN';
    }
    return null;
  }

  if (fs === 'Booking' || fs === 'Won') {
    if (
      isUnitAvailableForBooking(currentUnitStatus) ||
      isUnitBlockedStatus(currentUnitStatus) ||
      s === 'TOKEN'
    ) {
      return 'BOOKED';
    }
    return null;
  }

  if (fs === 'Lost') {
    if (s === 'TOKEN' || s === 'BLOCKED') return 'AVAILABLE';
    return null;
  }

  return null;
}

export function isSiteVisitOutcome(value: string): value is SiteVisitOutcome {
  return (SITE_VISIT_OUTCOMES as readonly string[]).includes(value);
}

/** After a completed site visit with a decisive outcome. */
export function funnelStageAfterSiteVisitOutcome(
  outcome: string
): InquiryFunnelStage | null {
  const o = String(outcome || '').trim();
  if (o === 'Disliked') return 'Lost';
  return null;
}

export async function applyUnitStatusForFunnelStage(
  supabase: SupabaseClient,
  unitId: string,
  funnelStage: string
): Promise<{ updated: boolean; error?: string }> {
  const uid = String(unitId || '').trim();
  if (!uid) return { updated: false };

  const { data: unitRow, error: readErr } = await supabase
    .from('units')
    .select('status')
    .eq('id', uid)
    .maybeSingle();
  if (readErr) return { updated: false, error: readErr.message };

  const nextStatus = targetUnitStatusForFunnelStage(
    funnelStage,
    unitRow?.status as string | undefined
  );
  if (!nextStatus) return { updated: false };

  const { error: unitErr } = await supabase
    .from('units')
    .update({ status: nextStatus })
    .eq('id', uid);
  if (unitErr) return { updated: false, error: unitErr.message };
  return { updated: true };
}

/** Marks inquiry as qualified and blocks the unit when still available. */
export async function qualifyInquiryWithUnit(
  supabase: SupabaseClient,
  params: {
    opportunityId: string;
    unitId: string;
    qualifiedPayload?: QualifiedStagePayload;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { opportunityId, unitId, qualifiedPayload } = params;

  const unitResult = await applyUnitStatusForFunnelStage(
    supabase,
    unitId,
    'Qualified'
  );
  if (unitResult.error) return { ok: false, error: unitResult.error };

  const { error: oppErr } = await supabase
    .from('sales_opportunities')
    .update({ funnel_stage: 'Qualified' })
    .eq('id', opportunityId);
  if (oppErr) return { ok: false, error: oppErr.message };

  if (qualifiedPayload && Object.keys(qualifiedPayload).length > 0) {
    const { error: stageErr } = await supabase
      .from('sales_pipeline_stages')
      .upsert(
        {
          opportunity_id: opportunityId,
          stage: 'Qualified',
          payload: qualifiedPayload
        },
        { onConflict: 'opportunity_id,stage' }
      );
    if (stageErr) return { ok: false, error: stageErr.message };
  }

  return { ok: true };
}

export async function closeInquiryAsLost(
  supabase: SupabaseClient,
  params: { opportunityId: string; unitId?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const { opportunityId, unitId } = params;

  if (unitId) {
    const unitResult = await applyUnitStatusForFunnelStage(
      supabase,
      unitId,
      'Lost'
    );
    if (unitResult.error) return { ok: false, error: unitResult.error };
  }

  const { error: oppErr } = await supabase
    .from('sales_opportunities')
    .update({ funnel_stage: 'Lost' })
    .eq('id', opportunityId);
  if (oppErr) return { ok: false, error: oppErr.message };

  return { ok: true };
}
