import {
  BOOKING_WORKFLOW_STAGES,
  type BookingStageData,
  type BookingWorkflowStage
} from './booking-types';
import { isBookingPaymentMode } from '@/lib/booking/booking-payment';

export function nextWorkflowStage(
  current: BookingWorkflowStage
): BookingWorkflowStage | null {
  const idx = BOOKING_WORKFLOW_STAGES.indexOf(current);
  if (idx < 0 || idx >= BOOKING_WORKFLOW_STAGES.length - 1) return null;
  return BOOKING_WORKFLOW_STAGES[idx + 1]!;
}

export function previousWorkflowStage(
  current: BookingWorkflowStage
): BookingWorkflowStage | null {
  const idx = BOOKING_WORKFLOW_STAGES.indexOf(current);
  if (idx <= 0) return null;
  return BOOKING_WORKFLOW_STAGES[idx - 1]!;
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
      if (!isBookingPaymentMode(t?.mode)) {
        return { ok: false, reason: 'Select a valid token payment mode before continuing.' };
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
          reason:
            'Complete KYC (PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads) for the primary buyer and each co-applicant.'
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

/** Token captured at inquiry or on the bookings create form — no separate token step needed. */
export function isTokenStageComplete(
  stageData: BookingStageData | null | undefined
): boolean {
  return canAdvanceWorkflowStage('token', stageData).ok;
}

/** Token was officially recorded (create form, inquiry, or save). */
export function isTokenRecorded(
  stageData: BookingStageData | null | undefined
): boolean {
  const token = stageData?.token;
  if (String(token?.recorded_at ?? '').trim()) return true;
  return isTokenStageComplete(stageData);
}

/**
 * Token amount/date/mode must not change after recording or once the booking is confirmed.
 */
export function isTokenStageLocked(
  stageData: BookingStageData | null | undefined,
  workflowStage: BookingWorkflowStage
): boolean {
  if (workflowStage === 'confirmation') return true;
  if (isTokenRecorded(stageData)) return true;
  const stageIdx = BOOKING_WORKFLOW_STAGES.indexOf(workflowStage);
  const tokenIdx = BOOKING_WORKFLOW_STAGES.indexOf('token');
  return stageIdx > tokenIdx;
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
