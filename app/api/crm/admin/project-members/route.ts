import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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

async function requireSuperAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (pErr) return { ok: false as const, status: 500, error: pErr.message };
  if (profile?.role !== 'Super Admin')
    return { ok: false as const, status: 403, error: 'Forbidden' };

  return { ok: true as const };
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json()) as UpsertBody;
  if (!body?.projectId || !body?.userId) {
    return NextResponse.json({ error: 'Missing projectId/userId' }, { status: 400 });
  }

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
  const gate = await requireSuperAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json()) as DeleteBody;
  if (!body?.projectId || !body?.userId) {
    return NextResponse.json({ error: 'Missing projectId/userId' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('project_members')
    .delete()
    .eq('project_id', body.projectId)
    .eq('user_id', body.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

