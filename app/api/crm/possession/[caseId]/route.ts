import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyUser, requireProjectAccess } from '@/lib/authz';
import {
  mergePossessionChecklist,
  parsePossessionSnagList,
  type PossessionChecklistItem,
  type PossessionSnagItem
} from '@/lib/possession/possession-trackers';

type PatchBody = {
  checklist?: PossessionChecklistItem[];
  snagList?: PossessionSnagItem[];
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: caseRow, error: cErr } = await admin
    .from('possession_cases')
    .select('id, project_id')
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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (body.checklist !== undefined) {
    patch.checklist = mergePossessionChecklist(body.checklist);
  }
  if (body.snagList !== undefined) {
    patch.snag_list = parsePossessionSnagList(body.snagList);
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes?.trim() ? body.notes.trim() : null;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: updated, error: updErr } = await admin
    .from('possession_cases')
    .update(patch)
    .eq('id', caseId)
    .select('id, checklist, snag_list, notes, workflow_stage, keys_handed_over_at')
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, case: updated });
}
