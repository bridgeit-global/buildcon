import { describe, expect, it } from 'vitest';
import {
  BOOKING_WORKFLOW_STAGES
} from './booking-types';
import {
  canAdvanceWorkflowStage,
  isTokenRecorded,
  isTokenStageComplete,
  isTokenStageLocked,
  mergeStageData,
  nextWorkflowStage,
  previousWorkflowStage,
  targetUnitStatusForWorkflowStage
} from './booking-stage-transitions';

describe('nextWorkflowStage', () => {
  it('returns the next stage in order', () => {
    expect(nextWorkflowStage('token')).toBe('application');
    expect(nextWorkflowStage('application')).toBe('allotment');
  });

  it('returns null at the end', () => {
    expect(nextWorkflowStage('confirmation')).toBeNull();
  });

  it('returns null for unknown stage', () => {
    expect(nextWorkflowStage('unknown' as 'token')).toBeNull();
  });
});

describe('previousWorkflowStage', () => {
  it('returns the previous stage in order', () => {
    expect(previousWorkflowStage('application')).toBe('token');
    expect(previousWorkflowStage('confirmation')).toBe('allotment');
  });

  it('returns null at the start', () => {
    expect(previousWorkflowStage('token')).toBeNull();
  });
});

describe('canAdvanceWorkflowStage', () => {
  it('requires token amount, date, and mode', () => {
    expect(canAdvanceWorkflowStage('token', {})).toEqual({
      ok: false,
      reason: 'Enter token amount before continuing.'
    });
    expect(
      canAdvanceWorkflowStage('token', {
        token: { amount: '100000', date: '2026-01-01' }
      })
    ).toEqual({
      ok: false,
      reason: 'Select token payment mode before continuing.'
    });
    expect(
      canAdvanceWorkflowStage('token', {
        token: { amount: '100000', date: '2026-01-01', mode: 'UPI' }
      })
    ).toEqual({ ok: true });
  });

  it('requires application submitted_at and complete KYC', () => {
    expect(canAdvanceWorkflowStage('application', {})).toEqual({
      ok: false,
      reason: 'Mark application as submitted to continue.'
    });
    expect(
      canAdvanceWorkflowStage(
        'application',
        { application: { submitted_at: '2026-01-02' } },
        { kycComplete: false }
      )
    ).toMatchObject({ ok: false });
    expect(
      canAdvanceWorkflowStage(
        'application',
        { application: { submitted_at: '2026-01-02' } },
        { kycComplete: true }
      )
    ).toEqual({ ok: true });
  });

  it('requires allotment date', () => {
    expect(canAdvanceWorkflowStage('allotment', {})).toEqual({
      ok: false,
      reason: 'Enter allotment date before confirmation.'
    });
    expect(
      canAdvanceWorkflowStage('allotment', {
        allotment: { allotment_date: '2026-02-01' }
      })
    ).toEqual({ ok: true });
  });

  it('does not advance from confirmation', () => {
    expect(canAdvanceWorkflowStage('confirmation', {})).toEqual({
      ok: false,
      reason: 'Booking is already confirmed.'
    });
  });
});

describe('isTokenStageComplete', () => {
  it('delegates to canAdvanceWorkflowStage for token', () => {
    expect(
      isTokenStageComplete({
        token: { amount: '50000', date: '2026-01-01', mode: 'Cash' }
      })
    ).toBe(true);
  });
});

describe('isTokenRecorded', () => {
  it('returns true when recorded_at is present', () => {
    expect(
      isTokenRecorded({ token: { recorded_at: '2026-01-01T10:00:00Z' } })
    ).toBe(true);
  });

  it('falls back to token completeness', () => {
    expect(
      isTokenRecorded({
        token: { amount: '50000', date: '2026-01-01', mode: 'Cash' }
      })
    ).toBe(true);
  });
});

describe('isTokenStageLocked', () => {
  it('locks on confirmation workflow stage', () => {
    expect(isTokenStageLocked({}, 'confirmation')).toBe(true);
  });

  it('locks after token is recorded', () => {
    expect(
      isTokenStageLocked(
        { token: { recorded_at: '2026-01-01T10:00:00Z' } },
        'token'
      )
    ).toBe(true);
  });

  it('locks when workflow is past token', () => {
    expect(isTokenStageLocked({}, 'application')).toBe(true);
  });

  it('does not lock editable token stage', () => {
    expect(isTokenStageLocked({ token: { amount: '10000' } }, 'token')).toBe(
      false
    );
  });
});

describe('mergeStageData', () => {
  it('merges patch into the selected workflow stage', () => {
    expect(
      mergeStageData(
        { token: { amount: '100000' }, application: { occupation: 'Engineer' } },
        'token',
        { mode: 'UPI', reference: 'TXN1' }
      )
    ).toEqual({
      token: { amount: '100000', mode: 'UPI', reference: 'TXN1' },
      application: { occupation: 'Engineer' }
    });
  });

  it('creates stage object when missing', () => {
    expect(mergeStageData(null, 'allotment', { allotment_date: '2026-03-01' }))
      .toEqual({
        allotment: { allotment_date: '2026-03-01' }
      });
  });
});

describe('targetUnitStatusForWorkflowStage', () => {
  it('returns BOOKED when confirmed or on confirmation stage', () => {
    expect(targetUnitStatusForWorkflowStage('application', true)).toBe('BOOKED');
    expect(targetUnitStatusForWorkflowStage('confirmation', false)).toBe(
      'BOOKED'
    );
  });

  it('returns TOKEN for in-progress workflow', () => {
    expect(targetUnitStatusForWorkflowStage('token', false)).toBe('TOKEN');
    expect(targetUnitStatusForWorkflowStage('allotment', false)).toBe('TOKEN');
  });
});

describe('BOOKING_WORKFLOW_STAGES', () => {
  it('defines expected workflow order', () => {
    expect(BOOKING_WORKFLOW_STAGES).toEqual([
      'token',
      'application',
      'allotment',
      'confirmation'
    ]);
  });
});
