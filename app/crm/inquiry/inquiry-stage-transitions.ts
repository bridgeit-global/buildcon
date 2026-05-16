import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import type { InquiryStageData } from './inquiry-types';

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

export function isInquiryClosed(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined
): boolean {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return false;
  }
  return (stageData as Record<string, unknown>).closed === true;
}

/** Inventory status to apply when `funnel_stage` changes (app + DB mirror). */
export function targetUnitStatusForFunnelStage(
  funnelStage: string,
  currentUnitStatus: string | null | undefined
): string | null {
  const fs = String(funnelStage || '').trim();

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

  return null;
}

/** Release a unit held for an enquiry (token or blocked back to available). */
export async function releaseInquiryUnit(
  supabase: SupabaseClient,
  unitId: string
): Promise<{ ok: boolean; error?: string }> {
  const uid = String(unitId || '').trim();
  if (!uid) return { ok: true };

  const { data: unitRow, error: readErr } = await supabase
    .from('units')
    .select('status')
    .eq('id', uid)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const s = normalizeUnitStatusCode(unitRow?.status as string | undefined);
  if (s !== 'TOKEN' && s !== 'BLOCKED') return { ok: true };

  const { error: unitErr } = await supabase
    .from('units')
    .update({ status: 'AVAILABLE' })
    .eq('id', uid);
  if (unitErr) return { ok: false, error: unitErr.message };
  return { ok: true };
}

export function isSiteVisitOutcome(value: string): value is SiteVisitOutcome {
  return (SITE_VISIT_OUTCOMES as readonly string[]).includes(value);
}

function mergeStageData(
  existing: InquiryStageData | Record<string, unknown> | null | undefined,
  patch: Partial<InquiryStageData>
): InquiryStageData {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const { closed: _c, ...stageOnly } = base;
  return {
    enquiry: {
      ...((stageOnly.enquiry as Record<string, unknown>) ?? {}),
      ...(patch.enquiry ?? {})
    },
    qualified: {
      ...((stageOnly.qualified as Record<string, unknown>) ?? {}),
      ...(patch.qualified ?? {})
    },
    site_visit: {
      ...((stageOnly.site_visit as Record<string, unknown>) ?? {}),
      ...(patch.site_visit ?? {})
    },
    negotiation: {
      ...((stageOnly.negotiation as Record<string, unknown>) ?? {}),
      ...(patch.negotiation ?? {})
    },
    token: {
      ...((stageOnly.token as Record<string, unknown>) ?? {}),
      ...(patch.token ?? {})
    }
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

/** Close enquiry: release unit, reset stage to Enquiry, mark `stage_data.closed`. */
export async function closeInquiry(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    unitId?: string | null;
    stageData?: InquiryStageData | Record<string, unknown>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { inquiryId, unitId, stageData } = params;

  if (unitId) {
    const unitResult = await releaseInquiryUnit(supabase, unitId);
    if (!unitResult.ok) return { ok: false, error: unitResult.error };
  }

  const payload =
    stageData && typeof stageData === 'object' && !Array.isArray(stageData)
      ? { ...stageData, closed: true }
      : { closed: true };

  const { error: inqErr } = await supabase
    .from('sales_inquiries')
    .update({
      funnel_stage: 'Enquiry',
      stage_data: payload
    })
    .eq('id', inquiryId);
  if (inqErr) return { ok: false, error: inqErr.message };

  return { ok: true };
}

/** @deprecated Use `closeInquiry` */
export const closeInquiryAsLost = closeInquiry;
