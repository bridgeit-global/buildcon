/** Order matches `sales_inquiries.funnel_stage` DB check constraint. */
export const INQUIRY_FUNNEL_STAGE_ORDER = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token',
  'Closed'
] as const;

/** Terminal stage — not shown on the pipeline stepper. */
export const INQUIRY_CLOSED_FUNNEL_STAGE = 'Closed' as const;

export type InquiryFunnelStage = (typeof INQUIRY_FUNNEL_STAGE_ORDER)[number];

/** Stages persisted in `sales_inquiry_stages` (excludes terminal Closed). */
export type InquiryPipelineFunnelStage = Exclude<
  InquiryFunnelStage,
  typeof INQUIRY_CLOSED_FUNNEL_STAGE
>;

export const INQUIRY_PIPELINE_FUNNEL_STAGES = INQUIRY_FUNNEL_STAGE_ORDER.filter(
  (stage): stage is InquiryPipelineFunnelStage =>
    stage !== INQUIRY_CLOSED_FUNNEL_STAGE
);

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

/** List filter / badge labels including terminal stages. */
export const INQUIRY_LIST_FUNNEL_STAGES = [
  ...INQUIRY_PIPELINE_UI_STAGES,
  'Token',
  INQUIRY_CLOSED_FUNNEL_STAGE
] as const;

/** Index in `INQUIRY_PIPELINE_UI_STAGES` for a funnel stage (unknown → Enquiry). */
export function funnelStageIndex(stage: string | null | undefined): number {
  const t = pipelineUiStage(stage);
  const idx = INQUIRY_PIPELINE_UI_STAGES.indexOf(t);
  return idx >= 0 ? idx : 0;
}

export function pipelineUiStage(
  funnelStage: string | null | undefined
): InquiryPipelineUiStage {
  const t = String(funnelStage ?? '').trim() as InquiryFunnelStage;
  if (t === 'Closed') return 'Site Visit';
  if (t === 'Token') return 'Negotiation';
  if (
    (INQUIRY_PIPELINE_UI_STAGES as readonly string[]).includes(t)
  ) {
    return t as InquiryPipelineUiStage;
  }
  return 'Enquiry';
}

/**
 * Highest pipeline stepper index the user may open (0 = Enquiry).
 * Always allows one step ahead of the saved funnel stage so an Enquiry lead
 * can open Qualified to pick a unit (matches new-enquiry wizard reachability).
 */
export function maxReachablePipelineUiIndex(
  funnelStage: string | null | undefined,
  wizardStep = 1
): number {
  const dbIdx = funnelStageIndex(funnelStage);
  const wizardIdx = Math.max(0, wizardStep - 1);
  const last = INQUIRY_PIPELINE_UI_STAGES.length - 1;
  const oneAhead = Math.min(dbIdx + 1, last);
  return Math.min(Math.max(dbIdx, wizardIdx, oneAhead), last);
}

/**
 * Maps pipeline UI stage + saved `funnel_stage` to wizard step (1–3).
 * Step 2 is unit pick; once DB is already Qualified+, show step 3 (site visit).
 */
export function inquiryWizardStepForView(
  viewStage: InquiryPipelineUiStage,
  persistedFunnelStage: string | null | undefined
): 1 | 2 | 3 {
  if (viewStage === 'Enquiry') return 1;
  if (viewStage === 'Site Visit' || viewStage === 'Negotiation') return 3;
  const persisted = pipelineUiStage(persistedFunnelStage);
  if (
    persisted === 'Qualified' ||
    persisted === 'Site Visit' ||
    persisted === 'Negotiation'
  ) {
    return 3;
  }
  return 2;
}

/**
 * Pipeline stepper highlight while the 3-step enquiry wizard is open.
 * Wizard step 3 is the site-visit form even when `funnel_stage` is still Qualified.
 */
export function pipelineStepperHighlightStage(
  viewStage: InquiryPipelineUiStage,
  wizardStep: number,
  persistedFunnelStage?: string | null
): InquiryPipelineUiStage {
  if (wizardStep < 3) return viewStage;
  if (viewStage === 'Negotiation' || viewStage === 'Site Visit') return viewStage;
  const persisted = pipelineUiStage(persistedFunnelStage);
  if (viewStage === 'Enquiry' && persisted === 'Enquiry') return 'Enquiry';
  return 'Site Visit';
}
