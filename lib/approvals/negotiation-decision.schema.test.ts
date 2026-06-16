import { describe, expect, it } from 'vitest';
import { negotiationDecisionSchema } from './negotiation-decision.schema';

describe('negotiationDecisionSchema', () => {
  it('accepts empty decision note', () => {
    expect(
      negotiationDecisionSchema.safeParse({ decisionNote: '' }).success
    ).toBe(true);
  });

  it('accepts decision note text', () => {
    expect(
      negotiationDecisionSchema.safeParse({
        decisionNote: 'Approved with standard terms.'
      }).success
    ).toBe(true);
  });
});
