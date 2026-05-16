import {
  normalizeUnitStatusCode
} from '../inventory/unit-status';
import type { InquiryStageData } from './inquiry-types';
import { isInquiryClosed, targetUnitStatusForFunnelStage } from './inquiry-stage-transitions';

/** Order matches `sales_inquiries.funnel_stage` DB check constraint. */
export const INQUIRY_FUNNEL_STAGE_ORDER = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token'
] as const;

export type InquiryFunnelStage = (typeof INQUIRY_FUNNEL_STAGE_ORDER)[number];

const STAGE_RANK = new Map<string, number>(
  INQUIRY_FUNNEL_STAGE_ORDER.map((s, i) => [s, i])
);

function funnelStageRank(stage: string): number {
  const t = String(stage || '').trim();
  return STAGE_RANK.get(t) ?? -1;
}

/**
 * Typical funnel stage for this unit inventory state (guidance only — not enforced in DB).
 */
export function suggestedFunnelStageForUnitStatus(
  status: string | null | undefined
): InquiryFunnelStage {
  const s = normalizeUnitStatusCode(status);
  const raw = String(status || '').trim();

  if (s === 'TOKEN') return 'Token';
  if (s === 'BOOKED' || raw === 'B') return 'Token';
  if (
    ['AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED'].includes(s) ||
    raw === 'S'
  ) {
    return 'Token';
  }
  if (s === 'CANCELLED') return 'Enquiry';

  if (s === 'BLOCKED' || raw === 'BL') {
    return 'Qualified';
  }

  if (s === 'AVAILABLE' || raw === 'A' || raw === 'a') {
    return 'Enquiry';
  }

  return 'Enquiry';
}

/** Short hint for sales staff when picking a unit or reviewing an enquiry. */
export function unitStatusInquiryStageHint(
  status: string | null | undefined
): string {
  const typical = suggestedFunnelStageForUnitStatus(status);
  const s = normalizeUnitStatusCode(status);
  if (s === 'TOKEN') {
    return `Inventory shows token received — pipeline is usually at ${typical}.`;
  }
  if (s === 'BOOKED') {
    return `Unit is booked — align pipeline with ${typical}; create a booking from inventory when ready.`;
  }
  if (['AGREEMENT', 'REGISTERED', 'PRE_POSSESSION', 'POSSESSED'].includes(s)) {
    return `Unit is post-booking — pipeline is typically at ${typical}.`;
  }
  if (s === 'CANCELLED') {
    return `Unit is cancelled — start a new enquiry if the buyer returns.`;
  }
  if (s === 'BLOCKED') {
    return `Unit is blocked for this lead — pipeline is usually at ${typical} or later (site visit, negotiation).`;
  }
  return `With this inventory status, enquiries usually sit in ${typical} through site visit and negotiation before token.`;
}

/**
 * Compares current `funnel_stage` to the stage suggested by unit status.
 * Returns `null` if stages are unknown or not comparable.
 */
export function funnelUnitAlignment(
  funnelStage: string | null | undefined,
  unitStatus: string | null | undefined,
  stageData?: InquiryStageData | Record<string, unknown> | null
): 'aligned' | 'pipeline_behind' | 'pipeline_ahead' | null {
  if (isInquiryClosed(stageData)) return 'aligned';
  const f = String(funnelStage || '').trim();
  const suggested = suggestedFunnelStageForUnitStatus(unitStatus);
  const fi = funnelStageRank(f);
  const si = funnelStageRank(suggested);
  if (fi < 0 || si < 0) return null;
  if (fi === si) return 'aligned';
  if (fi < si) return 'pipeline_behind';
  return 'pipeline_ahead';
}

export function funnelUnitAlignmentMessage(
  funnelStage: string | null | undefined,
  unitStatus: string | null | undefined,
  stageData?: InquiryStageData | Record<string, unknown> | null
): string | null {
  if (isInquiryClosed(stageData)) return null;
  const rel = funnelUnitAlignment(funnelStage, unitStatus, stageData);
  const suggested = suggestedFunnelStageForUnitStatus(unitStatus);
  if (rel === 'pipeline_behind') {
    return `Pipeline is ${String(funnelStage || '').trim()} but this unit usually matches ${suggested} or later — consider updating the stage.`;
  }
  if (rel === 'pipeline_ahead') {
    return `Pipeline is ahead of what this unit status typically reflects — confirm inventory is updated.`;
  }
  return null;
}

/** @deprecated Use `targetUnitStatusForFunnelStage` from inquiry-stage-transitions. */
export function targetUnitStatusForSavedFunnelStage(
  funnelStage: string,
  currentUnitStatus: string | null | undefined
): string | null {
  return targetUnitStatusForFunnelStage(funnelStage, currentUnitStatus);
}
