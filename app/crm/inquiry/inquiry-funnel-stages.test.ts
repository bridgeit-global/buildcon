import { describe, expect, it } from 'vitest';
import {
  INQUIRY_CLOSED_FUNNEL_STAGE,
  INQUIRY_FUNNEL_STAGE_ORDER,
  INQUIRY_LIST_FUNNEL_STAGES,
  INQUIRY_PIPELINE_FUNNEL_STAGES,
  INQUIRY_PIPELINE_UI_STAGES,
  funnelStageIndex,
  funnelStageRank,
  inquiryWizardStepForView,
  isFunnelStageRegression,
  maxReachablePipelineUiIndex,
  pipelineStepperHighlightStage,
  pipelineUiStage
} from './inquiry-funnel-stages';

describe('funnelStageRank', () => {
  it('returns index for known stages', () => {
    expect(funnelStageRank('Enquiry')).toBe(0);
    expect(funnelStageRank('Negotiation')).toBe(3);
    expect(funnelStageRank('Closed')).toBe(5);
  });

  it('returns -1 for unknown or empty stages', () => {
    expect(funnelStageRank('Unknown')).toBe(-1);
    expect(funnelStageRank(null)).toBe(-1);
    expect(funnelStageRank('  ')).toBe(-1);
  });
});

describe('isFunnelStageRegression', () => {
  it('detects moving to an earlier stage', () => {
    expect(isFunnelStageRegression('Negotiation', 'Qualified')).toBe(true);
  });

  it('returns false for forward moves or same stage', () => {
    expect(isFunnelStageRegression('Qualified', 'Negotiation')).toBe(false);
    expect(isFunnelStageRegression('Site Visit', 'Site Visit')).toBe(false);
  });

  it('returns false when either stage is unknown', () => {
    expect(isFunnelStageRegression('Enquiry', 'Invalid')).toBe(false);
    expect(isFunnelStageRegression(null, 'Enquiry')).toBe(false);
  });
});

describe('pipelineUiStage', () => {
  it('maps Closed and Token to earlier UI stages', () => {
    expect(pipelineUiStage('Closed')).toBe('Site Visit');
    expect(pipelineUiStage('Token')).toBe('Negotiation');
  });

  it('passes through pipeline UI stages', () => {
    expect(pipelineUiStage('Qualified')).toBe('Qualified');
    expect(pipelineUiStage('Site Visit')).toBe('Site Visit');
  });

  it('defaults unknown stages to Enquiry', () => {
    expect(pipelineUiStage('')).toBe('Enquiry');
    expect(pipelineUiStage('Invalid')).toBe('Enquiry');
  });
});

describe('funnelStageIndex', () => {
  it('returns UI index for pipeline stages', () => {
    expect(funnelStageIndex('Enquiry')).toBe(0);
    expect(funnelStageIndex('Negotiation')).toBe(3);
  });

  it('maps Token to Negotiation index', () => {
    expect(funnelStageIndex('Token')).toBe(3);
  });
});

describe('maxReachablePipelineUiIndex', () => {
  it('allows one step ahead of saved funnel stage', () => {
    expect(maxReachablePipelineUiIndex('Enquiry')).toBe(1);
    expect(maxReachablePipelineUiIndex('Qualified')).toBe(2);
  });

  it('respects wizard step progress', () => {
    expect(maxReachablePipelineUiIndex('Enquiry', 3)).toBe(2);
  });

  it('caps at last pipeline UI stage', () => {
    expect(maxReachablePipelineUiIndex('Negotiation')).toBe(3);
  });
});

describe('inquiryWizardStepForView', () => {
  it('returns step 1 for Enquiry view', () => {
    expect(inquiryWizardStepForView('Enquiry', 'Enquiry')).toBe(1);
  });

  it('returns step 3 for site visit and negotiation views', () => {
    expect(inquiryWizardStepForView('Site Visit', 'Qualified')).toBe(3);
    expect(inquiryWizardStepForView('Negotiation', 'Qualified')).toBe(3);
  });

  it('returns step 2 for Qualified when persisted is still Enquiry', () => {
    expect(inquiryWizardStepForView('Qualified', 'Enquiry')).toBe(2);
  });

  it('returns step 3 for Qualified when persisted is already advanced', () => {
    expect(inquiryWizardStepForView('Qualified', 'Qualified')).toBe(3);
    expect(inquiryWizardStepForView('Qualified', 'Site Visit')).toBe(3);
  });
});

describe('pipelineStepperHighlightStage', () => {
  it('returns view stage when wizard step is before 3', () => {
    expect(pipelineStepperHighlightStage('Qualified', 2, 'Enquiry')).toBe(
      'Qualified'
    );
  });

  it('highlights Site Visit for qualified wizard step 3', () => {
    expect(pipelineStepperHighlightStage('Qualified', 3, 'Qualified')).toBe(
      'Site Visit'
    );
  });

  it('keeps Negotiation and Site Visit when wizard step is 3', () => {
    expect(pipelineStepperHighlightStage('Negotiation', 3, 'Negotiation')).toBe(
      'Negotiation'
    );
    expect(pipelineStepperHighlightStage('Site Visit', 3, 'Site Visit')).toBe(
      'Site Visit'
    );
  });

  it('stays on Enquiry when both view and persisted are Enquiry at step 3', () => {
    expect(pipelineStepperHighlightStage('Enquiry', 3, 'Enquiry')).toBe(
      'Enquiry'
    );
  });
});

describe('constants', () => {
  it('excludes Closed from pipeline funnel stages', () => {
    expect(INQUIRY_PIPELINE_FUNNEL_STAGES).not.toContain(
      INQUIRY_CLOSED_FUNNEL_STAGE
    );
    expect(INQUIRY_FUNNEL_STAGE_ORDER.at(-1)).toBe('Closed');
  });

  it('includes Token and Closed in list filter stages', () => {
    expect(INQUIRY_LIST_FUNNEL_STAGES).toContain('Token');
    expect(INQUIRY_LIST_FUNNEL_STAGES).toContain('Closed');
    expect(INQUIRY_PIPELINE_UI_STAGES).not.toContain('Token');
  });
});
