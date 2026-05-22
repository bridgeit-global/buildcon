import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz';

export async function GET(request: Request) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('crm_user_notifications')
    .select('id, kind, title, body, link_path, read_at, created_at, project_id')
    .eq('user_id', gate.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unread = (data ?? []).filter((r) => !r.read_at).length;
  return NextResponse.json({ rows: data ?? [], unread });
}

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { ids?: string[]; markAllRead?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  if (body.markAllRead) {
    const { error } = await supabase
      .from('crm_user_notifications')
      .update({ read_at: now })
      .eq('user_id', gate.userId)
      .is('read_at', null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const ids = (body.ids ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No notification ids' }, { status: 400 });
  }

  const { error } = await supabase
    .from('crm_user_notifications')
    .update({ read_at: now })
    .eq('user_id', gate.userId)
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
