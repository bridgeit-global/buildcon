import { describe, expect, it } from 'vitest';
import {
  SITE_VISIT_OUTCOMES,
  bookingBlockedByNegotiationApproval,
  computeNegotiationDiscount,
  getInquiryClosedStatus,
  getNegotiationApprovalStatus,
  isInquiryClosed,
  isSiteVisitOutcome,
  negotiationApprovalBlockMessage,
  negotiationBlocksTokenAdvance,
  targetUnitStatusForFunnelStage,
  tokenStageBlockedByNegotiation
} from './inquiry-stage-transitions';

describe('isInquiryClosed', () => {
  it('returns true when funnel stage is Closed', () => {
    expect(isInquiryClosed(null, 'Closed')).toBe(true);
  });

  it('returns true when stage_data.closed is true', () => {
    expect(isInquiryClosed({ closed: true }, 'Negotiation')).toBe(true);
  });

  it('returns false for open inquiries', () => {
    expect(isInquiryClosed({}, 'Negotiation')).toBe(false);
    expect(isInquiryClosed(null, 'Enquiry')).toBe(false);
  });

  it('returns false for invalid stage data', () => {
    expect(isInquiryClosed(null)).toBe(false);
    expect(isInquiryClosed([] as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('getInquiryClosedStatus', () => {
  it('returns null for open inquiries', () => {
    expect(getInquiryClosedStatus({}, 'Enquiry')).toBeNull();
  });

  it('returns closed_status or Closed default', () => {
    expect(getInquiryClosedStatus({ closed: true }, 'Closed')).toBe('Closed');
    expect(
      getInquiryClosedStatus({ closed: true, closed_status: 'Rejected' }, 'Closed')
    ).toBe('Rejected');
  });
});

describe('getNegotiationApprovalStatus', () => {
  it('parses known approval statuses', () => {
    expect(getNegotiationApprovalStatus({ approval_status: 'pending' })).toBe(
      'pending'
    );
    expect(getNegotiationApprovalStatus({ approval_status: 'Approved' })).toBe(
      'approved'
    );
    expect(getNegotiationApprovalStatus({ approval_status: 'REJECTED' })).toBe(
      'rejected'
    );
  });

  it('returns none for missing or invalid negotiation', () => {
    expect(getNegotiationApprovalStatus(null)).toBe('none');
    expect(getNegotiationApprovalStatus({ approval_status: 'unknown' })).toBe(
      'none'
    );
  });
});

describe('computeNegotiationDiscount', () => {
  it('computes discount from list and offered price', () => {
    expect(computeNegotiationDiscount(1_000_000, '900000')).toEqual({
      discountPct: 10,
      discountInr: 100_000
    });
  });

  it('returns zero discount when offered equals or exceeds list', () => {
    expect(computeNegotiationDiscount(1_000_000, 1_000_000)).toEqual({
      discountPct: 0,
      discountInr: 0
    });
    expect(computeNegotiationDiscount(1_000_000, 1_100_000)).toEqual({
      discountPct: 0,
      discountInr: 0
    });
  });

  it('returns nulls for invalid inputs', () => {
    expect(computeNegotiationDiscount(null, '900000')).toEqual({
      discountPct: null,
      discountInr: null
    });
    expect(computeNegotiationDiscount(1_000_000, '')).toEqual({
      discountPct: null,
      discountInr: null
    });
  });
});

describe('negotiationBlocksTokenAdvance', () => {
  it('blocks when discount needs approval and is not approved', () => {
    expect(
      negotiationBlocksTokenAdvance(
        { offered_price: '900000', approval_status: 'pending' },
        { listPriceInr: 1_000_000 }
      )
    ).toBe(true);
  });

  it('does not block when approved', () => {
    expect(
      negotiationBlocksTokenAdvance(
        { offered_price: '900000', approval_status: 'approved' },
        { listPriceInr: 1_000_000 }
      )
    ).toBe(false);
  });

  it('does not block when no discount requires approval', () => {
    expect(
      negotiationBlocksTokenAdvance(
        { offered_price: '1000000' },
        { listPriceInr: 1_000_000 }
      )
    ).toBe(false);
  });
});

describe('tokenStageBlockedByNegotiation', () => {
  it('blocks on Negotiation funnel when approval is pending', () => {
    expect(
      tokenStageBlockedByNegotiation(
        { offered_price: '900000', approval_status: 'pending' },
        { funnelStage: 'Negotiation', listPriceInr: 1_000_000 }
      )
    ).toBe(true);
  });

  it('does not block on Negotiation when no approval is required', () => {
    expect(
      tokenStageBlockedByNegotiation(
        { offered_price: '1000000' },
        { funnelStage: 'Negotiation', listPriceInr: 1_000_000 }
      )
    ).toBe(false);
  });

  it('uses negotiationBlocksTokenAdvance off Negotiation funnel', () => {
    expect(
      tokenStageBlockedByNegotiation(
        { offered_price: '900000', approval_status: 'pending' },
        { funnelStage: 'Token', listPriceInr: 1_000_000 }
      )
    ).toBe(true);
  });
});

describe('bookingBlockedByNegotiationApproval', () => {
  it('mirrors tokenStageBlockedByNegotiation', () => {
    const negotiation = { offered_price: '900000', approval_status: 'pending' };
    const options = { funnelStage: 'Negotiation', listPriceInr: 1_000_000 };
    expect(bookingBlockedByNegotiationApproval(negotiation, options)).toBe(
      tokenStageBlockedByNegotiation(negotiation, options)
    );
  });
});

describe('negotiationApprovalBlockMessage', () => {
  it('returns null when not blocked', () => {
    expect(
      negotiationApprovalBlockMessage(
        { offered_price: '1000000' },
        { funnelStage: 'Negotiation', listPriceInr: 1_000_000 }
      )
    ).toBeNull();
  });

  it('returns pending message on Negotiation funnel', () => {
    expect(
      negotiationApprovalBlockMessage(
        { offered_price: '900000', approval_status: 'pending' },
        { funnelStage: 'Negotiation', listPriceInr: 1_000_000 }
      )
    ).toContain('Admin approval is pending');
  });

  it('returns rejected message on Negotiation funnel', () => {
    expect(
      negotiationApprovalBlockMessage(
        { offered_price: '900000', approval_status: 'rejected' },
        { funnelStage: 'Negotiation', listPriceInr: 1_000_000 }
      )
    ).toContain('Budget was rejected');
  });

  it('returns generic message off Negotiation funnel', () => {
    expect(
      negotiationApprovalBlockMessage(
        { offered_price: '900000', approval_status: 'pending' },
        { funnelStage: 'Token', listPriceInr: 1_000_000 }
      )
    ).toContain('Negotiate stage');
  });
});

describe('targetUnitStatusForFunnelStage', () => {
  it('blocks available unit when qualifying', () => {
    expect(targetUnitStatusForFunnelStage('Qualified', 'AVAILABLE')).toBe(
      'BLOCKED'
    );
  });

  it('does not change non-available unit when qualifying', () => {
    expect(targetUnitStatusForFunnelStage('Qualified', 'BLOCKED')).toBeNull();
  });

  it('sets TOKEN from available or blocked on Token stage', () => {
    expect(targetUnitStatusForFunnelStage('Token', 'AVAILABLE')).toBe('TOKEN');
    expect(targetUnitStatusForFunnelStage('Token', 'BLOCKED')).toBe('TOKEN');
  });

  it('returns null for other funnel stages', () => {
    expect(targetUnitStatusForFunnelStage('Enquiry', 'AVAILABLE')).toBeNull();
  });
});

describe('isSiteVisitOutcome', () => {
  it('accepts valid outcomes', () => {
    for (const outcome of SITE_VISIT_OUTCOMES) {
      expect(isSiteVisitOutcome(outcome)).toBe(true);
    }
  });

  it('rejects invalid outcomes', () => {
    expect(isSiteVisitOutcome('Interested')).toBe(false);
  });
});
