import { z } from 'zod';

/** Optional note on approve/reject; no max length enforced client-side. */
export const negotiationDecisionSchema = z.object({
  decisionNote: z.string()
});

export type NegotiationDecisionValues = z.infer<typeof negotiationDecisionSchema>;
