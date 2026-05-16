import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import type { InquiryStageData } from './inquiry-types';
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

function mergeStageData(
  existing: InquiryStageData | Record<string, unknown> | null | undefined,
  patch: Partial<InquiryStageData>
): InquiryStageData {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as InquiryStageData)
      : {};
  return {
    enquiry: { ...(base.enquiry ?? {}), ...(patch.enquiry ?? {}) },
    qualified: { ...(base.qualified ?? {}), ...(patch.qualified ?? {}) },
    site_visit: { ...(base.site_visit ?? {}), ...(patch.site_visit ?? {}) },
    negotiation: { ...(base.negotiation ?? {}), ...(patch.negotiation ?? {}) },
    token: { ...(base.token ?? {}), ...(patch.token ?? {}) }
  };
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
    inquiryId: string;
    unitId: string;
    qualifiedPayload?: QualifiedStagePayload;
    enquiryPayload?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { inquiryId, unitId, qualifiedPayload, enquiryPayload } = params;

  const unitResult = await applyUnitStatusForFunnelStage(
    supabase,
    unitId,
    'Qualified'
  );
  if (unitResult.error) return { ok: false, error: unitResult.error };

  const { data: row, error: readErr } = await supabase
    .from('sales_inquiries')
    .select('stage_data')
    .eq('id', inquiryId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const stagePatch: Partial<InquiryStageData> = {};
  if (qualifiedPayload && Object.keys(qualifiedPayload).length > 0) {
    stagePatch.qualified = qualifiedPayload;
  }
  if (enquiryPayload && Object.keys(enquiryPayload).length > 0) {
    stagePatch.enquiry = enquiryPayload;
  }

  const { error: inqErr } = await supabase
    .from('sales_inquiries')
    .update({
      funnel_stage: 'Qualified',
      stage_data: mergeStageData(row?.stage_data, stagePatch)
    })
    .eq('id', inquiryId);
  if (inqErr) return { ok: false, error: inqErr.message };

  return { ok: true };
}

export async function closeInquiryAsLost(
  supabase: SupabaseClient,
  params: { inquiryId: string; unitId?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const { inquiryId, unitId } = params;

  if (unitId) {
    const unitResult = await applyUnitStatusForFunnelStage(
      supabase,
      unitId,
      'Lost'
    );
    if (unitResult.error) return { ok: false, error: unitResult.error };
  }

  const { error: inqErr } = await supabase
    .from('sales_inquiries')
    .update({ funnel_stage: 'Lost' })
    .eq('id', inquiryId);
  if (inqErr) return { ok: false, error: inqErr.message };

  return { ok: true };
}
