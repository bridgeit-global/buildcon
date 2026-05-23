import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import type { InquiryStageData } from './inquiry-types';
import { negotiationRequiresApproval } from '@/lib/inquiry/negotiation-discount';
import { INQUIRY_CLOSED_FUNNEL_STAGE } from './inquiry-funnel-stages';
import { saveInquiryStageData } from './inquiry-stage-store';

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
  stageData: InquiryStageData | Record<string, unknown> | null | undefined,
  funnelStage?: string | null
): boolean {
  if (String(funnelStage ?? '').trim() === INQUIRY_CLOSED_FUNNEL_STAGE) {
    return true;
  }
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return false;
  }
  return (stageData as Record<string, unknown>).closed === true;
}

export type NegotiationApprovalStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected';

export function getNegotiationApprovalStatus(
  negotiation: Record<string, unknown> | null | undefined
): NegotiationApprovalStatus {
  if (!negotiation || typeof negotiation !== 'object' || Array.isArray(negotiation)) {
    return 'none';
  }
  const status = String(negotiation.approval_status ?? '').trim().toLowerCase();
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    return status;
  }
  return 'none';
}

/** Discount from unit list (agreement) price vs buyer offer. */
export function computeNegotiationDiscount(
  listPriceInr: number | null | undefined,
  offeredPriceRaw: string | number | null | undefined
): { discountPct: number | null; discountInr: number | null } {
  const listPrice = Number(listPriceInr);
  const offered = Number(String(offeredPriceRaw ?? '').trim());
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return { discountPct: null, discountInr: null };
  }
  if (!Number.isFinite(offered) || offered <= 0) {
    return { discountPct: null, discountInr: null };
  }
  if (offered >= listPrice) return { discountPct: 0, discountInr: 0 };
  const discountInr = listPrice - offered;
  const discountPct = Number(((discountInr / listPrice) * 100).toFixed(2));
  return { discountPct, discountInr };
}

/** True when discount terms need admin approval and are not yet approved. */
export function negotiationBlocksTokenAdvance(
  negotiation: Record<string, unknown> | null | undefined,
  options?: { listPriceInr?: number | null }
): boolean {
  if (!negotiation || typeof negotiation !== 'object' || Array.isArray(negotiation)) {
    return false;
  }
  if (!negotiationRequiresApproval(options?.listPriceInr, negotiation)) {
    return false;
  }
  return getNegotiationApprovalStatus(negotiation) !== 'approved';
}

/**
 * Block entering token while on the Negotiate funnel stage, or when a
 * negotiation approval flow exists but is not approved.
 */
export function tokenStageBlockedByNegotiation(
  negotiation: Record<string, unknown> | null | undefined,
  options?: { funnelStage?: string; listPriceInr?: number | null }
): boolean {
  const funnel = String(options?.funnelStage ?? '').trim();
  if (funnel === 'Negotiation') {
    if (!negotiationRequiresApproval(options?.listPriceInr, negotiation)) {
      return false;
    }
    return getNegotiationApprovalStatus(negotiation) !== 'approved';
  }
  return negotiationBlocksTokenAdvance(negotiation, options);
}

/** Same gate as token advance — enquiry must not create a booking until approved. */
export function bookingBlockedByNegotiationApproval(
  negotiation: Record<string, unknown> | null | undefined,
  options?: { funnelStage?: string; listPriceInr?: number | null }
): boolean {
  return tokenStageBlockedByNegotiation(negotiation, options);
}

/** User-facing message when `bookingBlockedByNegotiationApproval` is true; otherwise null. */
export function negotiationApprovalBlockMessage(
  negotiation: Record<string, unknown> | null | undefined,
  options?: { funnelStage?: string; listPriceInr?: number | null }
): string | null {
  if (!bookingBlockedByNegotiationApproval(negotiation, options)) return null;

  const status = getNegotiationApprovalStatus(negotiation);
  const onNegotiateFunnel =
    String(options?.funnelStage ?? '').trim() === 'Negotiation';

  if (status === 'pending') {
    return onNegotiateFunnel
      ? 'Admin approval is pending. Refresh status after decision — create a booking once approved.'
      : 'Budget approval is pending in the Negotiate stage. Check status there before creating a booking.';
  }

  if (onNegotiateFunnel) {
    if (status === 'rejected') {
      return 'Budget was rejected. Update the discount and send for admin approval again.';
    }
    return 'Enter a discount below list price and send for admin approval before creating a booking.';
  }

  return 'Complete budget approval in the Negotiate stage before creating a booking.';
}

/** Persist funnel stage Negotiation after site visit (interested buyer). */
export async function advanceInquiryToNegotiation(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    siteVisitPatch?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const patch: Partial<InquiryStageData> = {
    site_visit: {
      outcome: 'Interested',
      ...(params.siteVisitPatch ?? {})
    }
  };
  return saveInquiryStageData(supabase, {
    inquiryId: params.inquiryId,
    patch,
    funnelStage: 'Negotiation',
    markStagesCompleted: ['Site Visit']
  });
}

/** Undo mistaken close when budget was later approved (e.g. stale refresh). */
export async function reopenInquiryAfterBudgetApproval(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<{ ok: boolean; error?: string }> {
  const id = String(inquiryId || '').trim();
  if (!id) return { ok: false, error: 'Missing inquiry id' };

  const { data: inq, error: loadErr } = await supabase
    .from('sales_inquiries')
    .select('funnel_stage, stage_data')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!inq) return { ok: false, error: 'Inquiry not found' };

  const stageData = inq.stage_data as Record<string, unknown> | null;
  if (!isInquiryClosed(stageData, inq.funnel_stage)) return { ok: true };
  if (getInquiryClosedStatus(stageData, inq.funnel_stage) !== 'Rejected') {
    return { ok: true };
  }

  const nextStageData =
    stageData && typeof stageData === 'object' && !Array.isArray(stageData)
      ? { ...stageData }
      : {};
  delete nextStageData.closed;
  delete nextStageData.closed_status;

  const { error: updErr } = await supabase
    .from('sales_inquiries')
    .update({
      funnel_stage: 'Negotiation',
      stage_data: nextStageData
    })
    .eq('id', id);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}

export function getInquiryClosedStatus(
  stageData: InquiryStageData | Record<string, unknown> | null | undefined,
  funnelStage?: string | null
): string | null {
  if (!isInquiryClosed(stageData, funnelStage)) return null;
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return 'Closed';
  }
  const status = String(
    (stageData as Record<string, unknown>).closed_status ?? ''
  ).trim();
  return status || 'Closed';
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

  const { error: linkUnitErr } = await supabase
    .from('sales_inquiries')
    .update({ unit_id: unitId })
    .eq('id', inquiryId);
  if (linkUnitErr) return { ok: false, error: linkUnitErr.message };

  const unitResult = await applyUnitStatusForFunnelStage(
    supabase,
    unitId,
    'Qualified'
  );
  if (unitResult.error) return { ok: false, error: unitResult.error };

  const stagePatch: Partial<InquiryStageData> = {};
  if (qualifiedPayload && Object.keys(qualifiedPayload).length > 0) {
    stagePatch.qualified = qualifiedPayload as InquiryStageData['qualified'];
  }
  if (enquiryPayload && Object.keys(enquiryPayload).length > 0) {
    stagePatch.enquiry = enquiryPayload;
  }

  const saveResult = await saveInquiryStageData(supabase, {
    inquiryId,
    patch: stagePatch,
    funnelStage: 'Qualified',
    markStagesCompleted: ['Enquiry', 'Qualified']
  });
  if (!saveResult.ok) return { ok: false, error: saveResult.error };

  return { ok: true };
}

/** Close enquiry: release unit, set funnel to Closed, mark `stage_data.closed`. */
export async function closeInquiry(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    unitId?: string | null;
    stageData?: InquiryStageData | Record<string, unknown>;
    /** Stored on `stage_data.closed_status` (e.g. Rejected, Not Interested). */
    closedStatus?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { inquiryId, unitId, stageData, closedStatus } = params;

  if (unitId) {
    const unitResult = await releaseInquiryUnit(supabase, unitId);
    if (!unitResult.ok) return { ok: false, error: unitResult.error };
  }

  const closedLabel = String(closedStatus || 'Closed').trim() || 'Closed';
  const payload =
    stageData && typeof stageData === 'object' && !Array.isArray(stageData)
      ? { ...stageData, closed: true, closed_status: closedLabel }
      : { closed: true, closed_status: closedLabel };

  const { error: inqErr } = await supabase
    .from('sales_inquiries')
    .update({
      funnel_stage: INQUIRY_CLOSED_FUNNEL_STAGE,
      stage_data: payload
    })
    .eq('id', inquiryId);
  if (inqErr) return { ok: false, error: inqErr.message };

  return { ok: true };
}

/** @deprecated Use `closeInquiry` */
export const closeInquiryAsLost = closeInquiry;
