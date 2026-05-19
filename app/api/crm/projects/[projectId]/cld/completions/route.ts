import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  applyCldStageCompletionToProjectBookings,
  syncProjectBookingPaymentSchedules,
  type CldStageWithId
} from '@/lib/booking/booking-schedule';

type CompletionBody = {
  stageId: string;
  notes?: string | null;
  completedOn?: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = (await request.json()) as CompletionBody;
  const stageId = String(body.stageId ?? '').trim();
  if (!stageId) {
    return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
  }

  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const ro = await isReadOnlyUser(gate.userId);
  if (!ro.ok) return NextResponse.json({ error: ro.error }, { status: ro.status });
  if (ro.readOnly) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createSupabaseAdminClient();

  const { data: stage, error: stageErr } = await admin
    .from('project_cld_stages')
    .select('id,project_id,sort_order,name,demand_kind,demand_value,slab_label')
    .eq('id', stageId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (stageErr) {
    return NextResponse.json({ error: stageErr.message }, { status: 500 });
  }
  if (!stage) {
    return NextResponse.json({ error: 'CLD stage not found' }, { status: 404 });
  }

  const completedOn =
    String(body.completedOn ?? '').trim() || todayIsoDate();
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : 'Marked complete from CRM';

  const { data: completion, error: compErr } = await admin
    .from('cld_stage_completions')
    .insert({
      project_id: projectId,
      stage_id: stageId,
      completed_on: completedOn,
      notes,
      created_by: gate.userId
    })
    .select('id,completed_on')
    .single();
  if (compErr) {
    return NextResponse.json({ error: compErr.message }, { status: 500 });
  }

  let applyResult;
  try {
    applyResult = await applyCldStageCompletionToProjectBookings(admin, {
      projectId,
      stage: stage as CldStageWithId,
      completedOn
    });
    await syncProjectBookingPaymentSchedules(admin, projectId);
  } catch (e) {
    await admin.from('cld_stage_completions').delete().eq('id', completion.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update payment schedules' },
      { status: 500 }
    );
  }

  const { data: bookings } = await admin
    .from('bookings')
    .select('id')
    .eq('project_id', projectId)
    .neq('status', 'cancelled');

  if (bookings?.length) {
    const { error: qErr } = await admin.from('cld_notification_queue').insert(
      bookings.map((b) => ({
        project_id: projectId,
        booking_id: b.id as string,
        channel: 'email',
        payload: {
          stage_id: stageId,
          completion_id: completion.id,
          kind: 'cld_stage_complete',
          completed_on: completedOn
        },
        status: 'pending'
      }))
    );
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    completionId: completion.id,
    completedOn: completion.completed_on,
    ...applyResult
  });
}
