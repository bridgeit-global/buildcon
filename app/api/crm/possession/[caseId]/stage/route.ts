import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import {
  isUnitPossessedStatus,
  unitStatusFromBookingUnitsJoin
} from '@/app/crm/inventory/unit-status';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  stage?: 'OC' | 'FinalDemand' | 'PossessionLetter' | 'Handover' | 'Closed';
};

const VALID_STAGES = new Set<NonNullable<Body['stage']>>([
  'OC',
  'FinalDemand',
  'PossessionLetter',
  'Handover',
  'Closed'
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const stage = body.stage;
  if (!stage || !VALID_STAGES.has(stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: caseRow, error: cErr } = await admin
    .from('possession_cases')
    .select(
      'id, project_id, unit_id, booking_id, workflow_stage, keys_handed_over_at, units(status)'
    )
    .eq('id', caseId)
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const projectId = caseRow.project_id as string;
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const patch: Record<string, unknown> = { workflow_stage: stage };
  if (stage === 'Closed' || stage === 'Handover') {
    patch.keys_handed_over_at = caseRow.keys_handed_over_at ?? new Date().toISOString();
  }

  const { error: updErr } = await admin
    .from('possession_cases')
    .update(patch)
    .eq('id', caseId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const bookingId = (caseRow.booking_id as string | null) ?? null;
  const unitId = caseRow.unit_id as string;

  // Map possession workflow → unit lifecycle status.
  const targetStatus: 'PRE_POSSESSION' | 'POSSESSED' | null =
    stage === 'PossessionLetter'
      ? 'PRE_POSSESSION'
      : stage === 'Handover' || stage === 'Closed'
        ? 'POSSESSED'
        : null;

  let unitStatus: string | null = null;
  if (targetStatus && bookingId) {
    const { error: rpcErr } = await admin.rpc('set_unit_status_for_booking', {
      p_booking_id: bookingId,
      p_target_status: targetStatus
    });
    if (rpcErr) {
      console.warn(
        `set_unit_status_for_booking(${bookingId}, ${targetStatus}) failed: ${rpcErr.message}`
      );
    } else {
      unitStatus = targetStatus;
    }
  } else if (targetStatus && !bookingId) {
    // Fallback: write directly to the unit when no booking is linked. Less strict
    // governance but keeps the lifecycle visible in inventory.
    await admin.from('units').update({ status: targetStatus }).eq('id', unitId);
    unitStatus = targetStatus;
  }

  // Auto-generate possession letter PDF when reaching PossessionLetter stage.
  // Notification is NOT sent automatically — review in Documents, then Send.
  // Skip when unit is already Possession given.
  const unitAlreadyPossessed = isUnitPossessedStatus(
    unitStatusFromBookingUnitsJoin(
      caseRow.units as { status: string } | { status: string }[] | null
    )
  );
  let generatedDocumentId: string | null = null;
  if (stage === 'PossessionLetter' && bookingId && !unitAlreadyPossessed) {
    const packRes = await loadBookingPrintPack(admin, bookingId);
    if (packRes.ok) {
      const persisted = await persistGeneratedBookingDocumentServer(
        admin,
        packRes.pack,
        'possession-letter',
        { generatedBy: gate.userId }
      );
      if (persisted.ok) {
        generatedDocumentId = persisted.id;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    stage,
    unitStatus,
    generatedDocumentId
  });
}
