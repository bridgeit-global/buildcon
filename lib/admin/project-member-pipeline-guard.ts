import type { SupabaseClient } from '@supabase/supabase-js';
import { isInquiryClosed } from '@/app/crm/inquiry/inquiry-stage-transitions';
import type { InquiryStageData } from '@/app/crm/inquiry/inquiry-types';

export const PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE =
  'Cannot remove this user — they have open enquiry pipeline units assigned to them. Reassign or close those enquiries first.';

export type ProjectMemberPipelineInquiryRow = {
  project_id: string;
  assigned_to: string | null;
  funnel_stage: string | null;
  stage_data: unknown;
  unit_id: string | null;
};

export function memberHasOpenPipelineUnit(
  row: Pick<
    ProjectMemberPipelineInquiryRow,
    'assigned_to' | 'unit_id' | 'funnel_stage' | 'stage_data'
  >
): boolean {
  if (!row.assigned_to || !row.unit_id) return false;
  return !isInquiryClosed(
    row.stage_data as InquiryStageData | Record<string, unknown> | null | undefined,
    row.funnel_stage
  );
}

export function projectMemberRemovalKey(projectId: string, userId: string): string {
  return `${projectId}\0${userId}`;
}

export function buildProjectMemberRemovalBlockSet(
  rows: ProjectMemberPipelineInquiryRow[]
): Set<string> {
  const blocked = new Set<string>();
  for (const row of rows) {
    if (!memberHasOpenPipelineUnit(row)) continue;
    blocked.add(projectMemberRemovalKey(row.project_id, row.assigned_to!));
  }
  return blocked;
}

export function buildPipelineBlockedUserIdsForProject(
  rows: Array<
    Pick<
      ProjectMemberPipelineInquiryRow,
      'assigned_to' | 'unit_id' | 'funnel_stage' | 'stage_data'
    >
  >
): Set<string> {
  const blocked = new Set<string>();
  for (const row of rows) {
    if (!memberHasOpenPipelineUnit(row) || !row.assigned_to) continue;
    blocked.add(row.assigned_to);
  }
  return blocked;
}

export async function assertProjectMemberCanBeRemoved(
  admin: SupabaseClient,
  projectId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('sales_inquiries')
    .select('funnel_stage, stage_data')
    .eq('project_id', projectId)
    .eq('assigned_to', userId)
    .not('unit_id', 'is', null);

  if (error) return { ok: false, error: error.message };

  const blocked = (data ?? []).some((row) =>
    memberHasOpenPipelineUnit({
      assigned_to: userId,
      unit_id: 'blocked',
      funnel_stage: row.funnel_stage,
      stage_data: row.stage_data
    })
  );

  if (blocked) {
    return { ok: false, error: PROJECT_MEMBER_REMOVE_PIPELINE_BLOCK_MESSAGE };
  }

  return { ok: true };
}
