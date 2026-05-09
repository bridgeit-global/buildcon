import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ProfileRole =
  | 'Super Admin'
  | 'Sales Manager'
  | 'Collection Agent'
  | 'CRM Executive'
  | 'Read Only'
  | (string & {});

export type ProjectMemberRole = 'Member' | 'Manager' | (string & {});

export type AuthzOk<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type AuthzFail = { ok: false; status: number; error: string };

export type AuthzResult<T extends Record<string, unknown> = Record<string, never>> =
  | AuthzOk<T>
  | AuthzFail;

export async function requireUser(): Promise<AuthzResult<{ userId: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) return { ok: false, status: 401, error: error.message };
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, userId: user.id };
}

export async function getProfileRole(
  userId: string
): Promise<AuthzResult<{ role: ProfileRole | null }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, role: (data?.role ?? null) as ProfileRole | null };
}

export function isSuperAdmin(role: ProfileRole | null | undefined): boolean {
  return role === 'Super Admin';
}

export async function requireSuperAdmin(): Promise<AuthzResult<{ userId: string }>> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const roleRes = await getProfileRole(gate.userId);
  if (!roleRes.ok) return roleRes;

  if (!isSuperAdmin(roleRes.role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, userId: gate.userId };
}

export async function requireProjectAccess(
  projectId: string
): Promise<AuthzResult<{ userId: string; isSuperAdmin: boolean }>> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const roleRes = await getProfileRole(gate.userId);
  if (!roleRes.ok) return roleRes;
  const superAdmin = isSuperAdmin(roleRes.role);
  if (superAdmin) return { ok: true, userId: gate.userId, isSuperAdmin: true };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', gate.userId)
    .eq('status', 'Active')
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true, userId: gate.userId, isSuperAdmin: false };
}

export async function requireProjectManagerOrSuperAdmin(
  projectId: string
): Promise<AuthzResult<{ userId: string; isSuperAdmin: boolean }>> {
  const gate = await requireProjectAccess(projectId);
  if (!gate.ok) return gate;
  if (gate.isSuperAdmin) return gate;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_members')
    .select('role,status')
    .eq('project_id', projectId)
    .eq('user_id', gate.userId)
    .eq('status', 'Active')
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 403, error: 'Forbidden' };

  const role = (data.role ?? null) as ProjectMemberRole | null;
  if (role !== 'Manager') return { ok: false, status: 403, error: 'Forbidden' };

  return gate;
}

export async function isReadOnlyUser(userId: string): Promise<AuthzResult<{ readOnly: boolean }>> {
  const roleRes = await getProfileRole(userId);
  if (!roleRes.ok) return roleRes;
  return { ok: true, readOnly: roleRes.role === 'Read Only' };
}

