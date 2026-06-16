import { describe, expect, it } from 'vitest';
import {
  funnelUnitAlignment,
  funnelUnitAlignmentMessage,
  suggestedFunnelStageForUnitStatus,
  targetUnitStatusForSavedFunnelStage,
  unitStatusInquiryStageHint
} from './inquiry-stage-unit-map';

describe('suggestedFunnelStageForUnitStatus', () => {
  it('maps available units to Enquiry', () => {
    expect(suggestedFunnelStageForUnitStatus('AVAILABLE')).toBe('Enquiry');
    expect(suggestedFunnelStageForUnitStatus('A')).toBe('Enquiry');
  });

  it('maps blocked units to Qualified', () => {
    expect(suggestedFunnelStageForUnitStatus('BLOCKED')).toBe('Qualified');
    expect(suggestedFunnelStageForUnitStatus('BL')).toBe('Qualified');
  });

  it('maps token and booked units to Token', () => {
    expect(suggestedFunnelStageForUnitStatus('TOKEN')).toBe('Token');
    expect(suggestedFunnelStageForUnitStatus('BOOKED')).toBe('Token');
    expect(suggestedFunnelStageForUnitStatus('B')).toBe('Token');
    expect(suggestedFunnelStageForUnitStatus('AGREEMENT')).toBe('Token');
    expect(suggestedFunnelStageForUnitStatus('S')).toBe('Token');
  });

  it('maps cancelled units to Enquiry', () => {
    expect(suggestedFunnelStageForUnitStatus('CANCELLED')).toBe('Enquiry');
  });
});

describe('unitStatusInquiryStageHint', () => {
  it('returns token-specific hint', () => {
    expect(unitStatusInquiryStageHint('TOKEN')).toContain('token received');
  });

  it('returns cancelled hint', () => {
    expect(unitStatusInquiryStageHint('CANCELLED')).toContain('cancelled');
  });

  it('returns default hint for available units', () => {
    expect(unitStatusInquiryStageHint('AVAILABLE')).toContain('Enquiry');
  });
});

describe('funnelUnitAlignment', () => {
  it('returns aligned for closed inquiries', () => {
    expect(funnelUnitAlignment('Negotiation', 'AVAILABLE', { closed: true })).toBe(
      'aligned'
    );
    expect(funnelUnitAlignment('Closed', 'AVAILABLE')).toBe('aligned');
  });

  it('detects pipeline behind unit status', () => {
    expect(funnelUnitAlignment('Enquiry', 'BLOCKED')).toBe('pipeline_behind');
    expect(funnelUnitAlignment('Qualified', 'TOKEN')).toBe('pipeline_behind');
  });

  it('detects pipeline ahead of unit status', () => {
    expect(funnelUnitAlignment('Negotiation', 'AVAILABLE')).toBe(
      'pipeline_ahead'
    );
  });

  it('returns aligned when stages match', () => {
    expect(funnelUnitAlignment('Qualified', 'BLOCKED')).toBe('aligned');
  });

  it('returns null for unknown funnel stages', () => {
    expect(funnelUnitAlignment('Invalid', 'AVAILABLE')).toBe(null);
  });
});

describe('funnelUnitAlignmentMessage', () => {
  it('returns null for closed inquiries', () => {
    expect(
      funnelUnitAlignmentMessage('Enquiry', 'BLOCKED', { closed: true })
    ).toBeNull();
  });

  it('returns behind message when pipeline lags unit status', () => {
    const msg = funnelUnitAlignmentMessage('Enquiry', 'BLOCKED');
    expect(msg).toContain('Pipeline is Enquiry');
    expect(msg).toContain('Qualified');
  });

  it('returns ahead message when pipeline is ahead', () => {
    expect(funnelUnitAlignmentMessage('Negotiation', 'AVAILABLE')).toContain(
      'ahead'
    );
  });

  it('returns null when aligned', () => {
    expect(funnelUnitAlignmentMessage('Qualified', 'BLOCKED')).toBeNull();
  });
});

describe('targetUnitStatusForSavedFunnelStage', () => {
  it('delegates to targetUnitStatusForFunnelStage', () => {
    expect(targetUnitStatusForSavedFunnelStage('Qualified', 'AVAILABLE')).toBe(
      'BLOCKED'
    );
    expect(targetUnitStatusForSavedFunnelStage('Token', 'BLOCKED')).toBe(
      'TOKEN'
    );
    expect(targetUnitStatusForSavedFunnelStage('Enquiry', 'AVAILABLE')).toBeNull();
  });
});
