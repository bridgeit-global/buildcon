import { describe, expect, it } from 'vitest';
import { negotiationApprovalStatusFromDb } from './inquiry-stage-store';
import {
  bookingBlockedByNegotiationApproval,
  isInquiryClosed
} from './inquiry-stage-transitions';
import type { InquiryStageData } from './inquiry-types';

type ApprovalRow = {
  sales_inquiry_id: string;
  id: string;
  status: string;
  offered_price: number | string | null;
  decision_note: string | null;
};

/** Mirrors private helper in booking-unit-picker-filter.ts */
function negotiationFromInquiryRow(
  stageData: unknown,
  approval: ApprovalRow | undefined
): Record<string, unknown> | undefined {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return undefined;
  }
  const neg = {
    ...(((stageData as InquiryStageData).negotiation ?? {}) as Record<
      string,
      unknown
    >)
  };
  if (!approval) return neg;

  const status = negotiationApprovalStatusFromDb(approval.status);
  const offered =
    approval.offered_price != null
      ? String(approval.offered_price)
      : String(neg.offered_price ?? '');

  return {
    ...neg,
    approval_id: approval.id,
    ...(offered ? { offered_price: offered } : {}),
    ...(status ? { approval_status: status } : {}),
    ...(approval.decision_note
      ? { decision_note: approval.decision_note }
      : {})
  };
}

/** Mirrors private helper in booking-unit-picker-filter.ts */
function inquiryBlocksUnitInBookingPicker(
  funnelStage: string | null | undefined,
  stageData: unknown,
  approval: ApprovalRow | undefined
): boolean {
  if (
    isInquiryClosed(
      stageData as InquiryStageData | Record<string, unknown> | null,
      funnelStage
    )
  ) {
    return false;
  }
  const negotiation = negotiationFromInquiryRow(stageData, approval);
  return bookingBlockedByNegotiationApproval(negotiation, {
    funnelStage: String(funnelStage ?? '')
  });
}

describe('negotiationFromInquiryRow', () => {
  it('returns negotiation from stage data', () => {
    expect(
      negotiationFromInquiryRow(
        { negotiation: { offered_price: '900000', discount_inr: '100000' } },
        undefined
      )
    ).toEqual({ offered_price: '900000', discount_inr: '100000' });
  });

  it('merges latest approval row into negotiation payload', () => {
    const merged = negotiationFromInquiryRow(
      { negotiation: { offered_price: '950000' } },
      {
        sales_inquiry_id: 'inq-1',
        id: 'appr-1',
        status: 'Pending',
        offered_price: 900000,
        decision_note: 'Awaiting review'
      }
    );

    expect(merged).toMatchObject({
      offered_price: '900000',
      approval_id: 'appr-1',
      approval_status: 'pending',
      decision_note: 'Awaiting review'
    });
  });
});

describe('inquiryBlocksUnitInBookingPicker', () => {
  it('does not block closed inquiries', () => {
    expect(
      inquiryBlocksUnitInBookingPicker('Closed', { closed: true }, undefined)
    ).toBe(false);
  });

  it('blocks open inquiry on Negotiation with pending approval', () => {
    expect(
      inquiryBlocksUnitInBookingPicker(
        'Negotiation',
        {
          negotiation: { offered_price: '900000', approval_status: 'pending' }
        },
        undefined
      )
    ).toBe(true);
  });

  it('does not block when negotiation is approved', () => {
    expect(
      inquiryBlocksUnitInBookingPicker(
        'Negotiation',
        {
          negotiation: {
            offered_price: '900000',
            approval_status: 'approved'
          }
        },
        undefined
      )
    ).toBe(false);
  });

  it('does not block when negotiation has no discount terms', () => {
    expect(
      inquiryBlocksUnitInBookingPicker(
        'Negotiation',
        { negotiation: {} },
        undefined
      )
    ).toBe(false);
  });

  it('blocks using merged approval row when stage data is stale', () => {
    expect(
      inquiryBlocksUnitInBookingPicker(
        'Negotiation',
        { negotiation: { offered_price: '1000000' } },
        {
          sales_inquiry_id: 'inq-1',
          id: 'appr-2',
          status: 'Pending',
          offered_price: 900000,
          decision_note: null
        }
      )
    ).toBe(true);
  });
});
