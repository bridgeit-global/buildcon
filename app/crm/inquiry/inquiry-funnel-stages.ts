/** Order matches `sales_inquiries.funnel_stage` DB check constraint. */
export const INQUIRY_FUNNEL_STAGE_ORDER = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token'
] as const;

export type InquiryFunnelStage = (typeof INQUIRY_FUNNEL_STAGE_ORDER)[number];

const FUNNEL_STAGE_RANK = new Map<string, number>(
  INQUIRY_FUNNEL_STAGE_ORDER.map((stage, index) => [stage, index])
);

/** Index in pipeline order; unknown stages return -1. */
export function funnelStageRank(stage: string | null | undefined): number {
  const t = String(stage ?? '').trim();
  return FUNNEL_STAGE_RANK.get(t) ?? -1;
}

/** True when `next` is earlier in the pipeline than `current`. */
export function isFunnelStageRegression(
  current: string | null | undefined,
  next: string | null | undefined
): boolean {
  const cur = funnelStageRank(current);
  const nxt = funnelStageRank(next);
  if (cur < 0 || nxt < 0) return false;
  return nxt < cur;
}

/** Leads & pipeline stepper — token is captured on the bookings create form. */
export const INQUIRY_PIPELINE_UI_STAGES = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation'
] as const;

export type InquiryPipelineUiStage =
  (typeof INQUIRY_PIPELINE_UI_STAGES)[number];

/** @deprecated Use INQUIRY_PIPELINE_UI_STAGES — kept for list filters without Token. */
export const FUNNEL_STAGES = INQUIRY_PIPELINE_UI_STAGES;

export function pipelineUiStage(
  funnelStage: string | null | undefined
): InquiryPipelineUiStage {
  const t = String(funnelStage ?? '').trim() as InquiryFunnelStage;
  if (t === 'Token') return 'Negotiation';
  if (
    (INQUIRY_PIPELINE_UI_STAGES as readonly string[]).includes(t)
  ) {
    return t as InquiryPipelineUiStage;
  }
  return 'Enquiry';
}
