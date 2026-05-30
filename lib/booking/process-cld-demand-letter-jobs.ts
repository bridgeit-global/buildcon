import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CldStageWithId } from '@/lib/booking/booking-schedule';
import { generateCldDemandLettersForProject } from '@/lib/booking/generate-cld-demand-letters';

type ClaimedJob = {
  job_id: string;
  completion_id: string;
  project_id: string;
  stage_id: string;
  created_by: string | null;
};

async function loadStage(
  admin: SupabaseClient,
  projectId: string,
  stageId: string
): Promise<CldStageWithId | null> {
  const { data, error } = await admin
    .from('project_cld_stages')
    .select('id,project_id,sort_order,name,demand_kind,demand_value,slab_label')
    .eq('id', stageId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CldStageWithId;
}

/** Process one queued CLD demand letter job (PDF only — no customer notification). */
export async function processCldDemandLetterJob(
  admin: SupabaseClient,
  jobId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: claimRaw, error: claimErr } = await admin.rpc('claim_cld_demand_letter_job', {
    p_job_id: jobId
  });
  if (claimErr) {
    return { ok: false, error: claimErr.message };
  }

  const claim = claimRaw as { ok?: boolean; error?: string } & Partial<ClaimedJob>;
  if (!claim.ok) {
    return { ok: false, error: claim.error ?? 'Job not claimable' };
  }

  const stage = await loadStage(admin, claim.project_id!, claim.stage_id!);
  if (!stage) {
    await admin.rpc('complete_cld_demand_letter_job', {
      p_job_id: jobId,
      p_generated: 0,
      p_skipped: 0,
      p_error: 'CLD stage not found'
    });
    return { ok: false, error: 'CLD stage not found' };
  }

  try {
    const result = await generateCldDemandLettersForProject(admin, {
      projectId: claim.project_id!,
      stage,
      generatedBy: claim.created_by ?? null
    });

    const errMsg =
      result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null;

    await admin.rpc('complete_cld_demand_letter_job', {
      p_job_id: jobId,
      p_generated: result.demandLettersGenerated,
      p_skipped: result.demandLettersSkipped,
      p_error:
        result.demandLettersGenerated === 0 && errMsg ? errMsg : null
    });

    return errMsg && result.demandLettersGenerated === 0
      ? { ok: false, error: errMsg }
      : { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Demand letter generation failed';
    await admin.rpc('complete_cld_demand_letter_job', {
      p_job_id: jobId,
      p_generated: 0,
      p_skipped: 0,
      p_error: message
    });
    return { ok: false, error: message };
  }
}

/** Drain up to `limit` queued demand letter jobs. */
export async function processPendingCldDemandLetterJobs(
  admin: SupabaseClient,
  limit = 5
): Promise<{
  processed: number;
  failed: number;
  results: { jobId: string; ok: boolean; error?: string }[];
}> {
  const results: { jobId: string; ok: boolean; error?: string }[] = [];
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i += 1) {
    const { data: jobId, error: pickErr } = await admin.rpc('pick_next_cld_demand_letter_job');
    if (pickErr) {
      results.push({ jobId: '', ok: false, error: pickErr.message });
      failed += 1;
      break;
    }
    if (!jobId) break;

    const id = String(jobId);
    const result = await processCldDemandLetterJob(admin, id);
    results.push({ jobId: id, ...result });
    if (result.ok) processed += 1;
    else failed += 1;
  }

  return { processed, failed, results };
}
