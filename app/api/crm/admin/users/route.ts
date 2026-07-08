import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  getProfileRole,
  isSuperAdminOnly,
  requireOrgAdmin
} from '@/lib/authz';

type InviteUserBody = {
  email: string;
  name: string;
  profileRole:
    | 'Super Admin'
    | 'Admin'
    | 'Sales Manager'
    | 'Collection Agent'
    | 'CRM Executive'
    | 'Read Only';
  projectIds: string[];
  projectMemberRole?: string; // Member | Manager
};

export async function POST(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json()) as InviteUserBody;
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  if (body.profileRole === 'Super Admin') {
    const inviterRole = await getProfileRole(gate.userId);
    if (!inviterRole.ok || !isSuperAdminOnly(inviterRole.role)) {
      return NextResponse.json(
        { error: 'Only the Super Admin can assign the Super Admin role' },
        { status: 403 }
      );
    }

    const { count, error: countErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'Super Admin');
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Only one Super Admin is allowed' },
        { status: 409 }
      );
    }
  }

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
