import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import { processCldDemandLetterJob } from '@/lib/booking/process-cld-demand-letter-jobs';

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
    .select('id')
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

  // DB trigger `cld_stage_completions_apply` runs apply_cld_stage_completion + enqueues demand letter job.
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

  const { data: jobRow, error: jobErr } = await admin
    .from('cld_demand_letter_jobs')
    .select(
      'id,status,demand_letters_generated,demand_letters_skipped,last_error'
    )
    .eq('completion_id', completion.id)
    .maybeSingle();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  const { data: bookingCount } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('status', 'cancelled');

  let demandLettersGenerated = 0;
  let demandLettersSkipped = 0;
  let demandLetterErrors: string[] | undefined;

  if (jobRow?.id) {
    const jobResult = await processCldDemandLetterJob(admin, jobRow.id as string);
    if (!jobResult.ok && jobResult.error) {
      demandLetterErrors = [jobResult.error];
    }

    const { data: refreshedJob } = await admin
      .from('cld_demand_letter_jobs')
      .select('demand_letters_generated,demand_letters_skipped,status,last_error')
      .eq('id', jobRow.id)
      .maybeSingle();

    if (refreshedJob) {
      demandLettersGenerated = Number(refreshedJob.demand_letters_generated ?? 0);
      demandLettersSkipped = Number(refreshedJob.demand_letters_skipped ?? 0);
      if (refreshedJob.status === 'failed' && refreshedJob.last_error) {
        demandLetterErrors = [String(refreshedJob.last_error)];
      }
    }
  }

  return NextResponse.json({
    ok: true,
    completionId: completion.id,
    completedOn: completion.completed_on,
    bookingsProcessed: bookingCount ?? 0,
    demandLetterJobId: jobRow?.id,
    demandLettersGenerated,
    demandLettersSkipped,
    demandLetterErrors
  });
}
