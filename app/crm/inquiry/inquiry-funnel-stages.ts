/** Order matches `sales_inquiries.funnel_stage` DB check constraint. */
export const INQUIRY_FUNNEL_STAGE_ORDER = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token'
] as const;

export type InquiryFunnelStage = (typeof INQUIRY_FUNNEL_STAGE_ORDER)[number];
