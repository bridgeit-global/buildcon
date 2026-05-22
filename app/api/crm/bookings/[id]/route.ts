import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  isTokenStageLocked,
  mergeStageData
} from '@/app/crm/bookings/booking-stage-transitions';
import { bookingBuyerKycSchema } from '@/lib/booking/booking-workflow.schema';
import { normalizeAadhaar, normalizePan } from '@/lib/customer/kyc-identifiers';
import type {
  BookingStageData,
  BookingWorkflowStage
} from '@/app/crm/bookings/booking-types';

type PatchBody = {
  workflowStage?: BookingWorkflowStage;
  stageDataPatch?: Record<string, unknown>;
  coBuyers?: Array<{
    customer_id: string;
    relationship?: string | null;
  }>;
  panNumber?: string;
  aadhaarLast4?: string;
  customerId?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const body = (await request.json()) as PatchBody;
  const admin = createSupabaseAdminClient();

  const { data: booking, error: loadErr } = await admin
    .from('bookings')
    .select('id,project_id,customer_id,workflow_stage,stage_data,status,co_buyers')
    .eq('id', bookingId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Cancelled booking cannot be edited' }, { status: 409 });
  }

  const gate = await requireProjectAccess(booking.project_id as string);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  const workflowStage = booking.workflow_stage as BookingWorkflowStage;
  const existingStageData = (booking.stage_data ?? {}) as BookingStageData;

  if (body.stageDataPatch && typeof body.stageDataPatch === 'object') {
    const patchStage = body.workflowStage ?? workflowStage;
    if (
      patchStage === 'token' &&
      isTokenStageLocked(existingStageData, workflowStage)
    ) {
      return NextResponse.json(
        { error: 'Token details cannot be changed after recording or confirmation.' },
        { status: 409 }
      );
    }
    if (patchStage !== workflowStage) {
      return NextResponse.json(
        { error: 'Stage data can only be updated for the current workflow stage.' },
        { status: 400 }
      );
    }
    updates.stage_data = mergeStageData(
      existingStageData,
      workflowStage,
      body.stageDataPatch
    );
  }

  if (Array.isArray(body.coBuyers)) {
    const existing = Array.isArray(booking.co_buyers) ? booking.co_buyers : [];
    const byId = new Map(
      existing.map((c: { customer_id: string }) => [c.customer_id, c])
    );
    for (const patch of body.coBuyers) {
      const row = byId.get(patch.customer_id);
      if (row && typeof row === 'object') {
        (row as { relationship?: string | null }).relationship =
          patch.relationship?.trim() || null;
      }
    }
    updates.co_buyers = Array.from(byId.values());
  }

  const { error: updErr } = await admin
    .from('bookings')
    .update(updates)
    .eq('id', bookingId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const custId = body.customerId || (booking.customer_id as string);
  if (body.panNumber !== undefined || body.aadhaarLast4 !== undefined) {
    const kycParsed = bookingBuyerKycSchema.safeParse({
      pan_number: body.panNumber ?? '',
      aadhaar_last4: body.aadhaarLast4 ?? ''
    });
    if (!kycParsed.success) {
      return NextResponse.json(
        { error: kycParsed.error.issues[0]?.message ?? 'Invalid KYC identifiers.' },
        { status: 400 }
      );
    }
    const custPatch: Record<string, string> = {
      pan_number: normalizePan(String(body.panNumber ?? '')),
      aadhaar_last4: normalizeAadhaar(String(body.aadhaarLast4 ?? ''))
    };
    await admin.from('customers').update(custPatch).eq('id', custId);
  }

  return NextResponse.json({ ok: true });
}
