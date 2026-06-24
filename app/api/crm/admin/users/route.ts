import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/authz';

type InviteUserBody = {
  email: string;
  name: string;
  profileRole:
    | 'Super Admin'
    | 'Sales Manager'
    | 'Collection Agent'
    | 'CRM Executive'
    | 'Read Only';
  projectIds: string[];
  projectMemberRole?: string; // Member | Manager
};

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json()) as InviteUserBody;
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  // Invite user by email (creates auth user if missing).
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 });
  }

  const invitedUserId = invited.user?.id;
  if (!invitedUserId) {
    return NextResponse.json({ error: 'Invite did not return user id' }, { status: 500 });
  }

  // Ensure profile exists, set role/name
  const { error: profErr } = await admin.from('profiles').upsert(
    {
      id: invitedUserId,
      name,
      role: body.profileRole
    },
    { onConflict: 'id' }
  );
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const projectIds = Array.from(new Set(body.projectIds || [])).filter(Boolean);
  if (projectIds.length) {
    const memberRole = body.projectMemberRole || 'Member';
    const rows = projectIds.map((pid) => ({
      project_id: pid,
      user_id: invitedUserId,
      role: memberRole,
      status: 'Active'
    }));
    const { error: memErr } = await admin.from('project_members').upsert(rows, {
      onConflict: 'project_id,user_id'
    });
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  return NextResponse.json({ userId: invitedUserId });
}

