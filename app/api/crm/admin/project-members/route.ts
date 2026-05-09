import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireProjectManagerOrSuperAdmin } from '@/lib/authz';

type UpsertBody = {
  projectId: string;
  userId: string;
  role: string; // Member | Manager
  status: string; // Active | Inactive
};

type DeleteBody = {
  projectId: string;
  userId: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as UpsertBody;
  if (!body?.projectId || !body?.userId) {
    return NextResponse.json({ error: 'Missing projectId/userId' }, { status: 400 });
  }
  const gate = await requireProjectManagerOrSuperAdmin(body.projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('project_members').upsert(
    {
      project_id: body.projectId,
      user_id: body.userId,
      role: body.role || 'Member',
      status: body.status || 'Active'
    },
    { onConflict: 'project_id,user_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as DeleteBody;
  if (!body?.projectId || !body?.userId) {
    return NextResponse.json({ error: 'Missing projectId/userId' }, { status: 400 });
  }
  const gate = await requireProjectManagerOrSuperAdmin(body.projectId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('project_members')
    .delete()
    .eq('project_id', body.projectId)
    .eq('user_id', body.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

