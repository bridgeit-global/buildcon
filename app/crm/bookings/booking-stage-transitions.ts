import {
  BOOKING_WORKFLOW_STAGES,
  type BookingStageData,
  type BookingWorkflowStage
} from './booking-types';

export function nextWorkflowStage(
  current: BookingWorkflowStage
): BookingWorkflowStage | null {
  const idx = BOOKING_WORKFLOW_STAGES.indexOf(current);
  if (idx < 0 || idx >= BOOKING_WORKFLOW_STAGES.length - 1) return null;
  return BOOKING_WORKFLOW_STAGES[idx + 1]!;
}

export function canAdvanceWorkflowStage(
  current: BookingWorkflowStage,
  stageData: BookingStageData | null | undefined,
  options?: { kycComplete?: boolean }
): { ok: boolean; reason?: string } {
  const data = stageData ?? {};
  switch (current) {
    case 'token': {
      const t = data.token;
      if (!String(t?.amount ?? '').trim()) {
        return { ok: false, reason: 'Enter token amount before continuing.' };
      }
      if (!String(t?.date ?? '').trim()) {
        return { ok: false, reason: 'Enter token date before continuing.' };
      }
      if (!String(t?.mode ?? '').trim()) {
        return { ok: false, reason: 'Select token payment mode before continuing.' };
      }
      return { ok: true };
    }
    case 'application': {
      const a = data.application;
      if (!String(a?.submitted_at ?? '').trim()) {
        return { ok: false, reason: 'Mark application as submitted to continue.' };
      }
      if (options?.kycComplete === false) {
        return {
          ok: false,
          reason: 'Upload PAN and Aadhaar for the primary buyer and each co-applicant.'
        };
      }
      return { ok: true };
    }
    case 'allotment': {
      const al = data.allotment;
      if (!String(al?.allotment_date ?? '').trim()) {
        return { ok: false, reason: 'Enter allotment date before confirmation.' };
      }
      return { ok: true };
    }
    case 'confirmation':
      return { ok: false, reason: 'Booking is already confirmed.' };
    default:
      return { ok: false, reason: 'Unknown workflow stage.' };
  }
}

export function mergeStageData(
  existing: BookingStageData | Record<string, unknown> | null | undefined,
  stage: BookingWorkflowStage,
  patch: Record<string, unknown>
): BookingStageData {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as BookingStageData) }
      : {};
  const prev = (base[stage] ?? {}) as Record<string, unknown>;
  return {
    ...base,
    [stage]: { ...prev, ...patch }
  };
}

/** Unit status while booking is in progress (before confirmation). */
export function targetUnitStatusForWorkflowStage(
  workflowStage: BookingWorkflowStage,
  confirmed: boolean
): 'TOKEN' | 'BOOKED' | 'AVAILABLE' {
  if (confirmed || workflowStage === 'confirmation') return 'BOOKED';
  return 'TOKEN';
}
