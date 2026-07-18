/**
 * Super Admin or Admin — org-level CRM privileges (create projects, masters,
 * users, organization settings). Project data access is separate: Super Admin
 * is org-wide; Admin requires active `project_members` membership.
 */
export function isOrgAdmin(role: string | null | undefined): boolean {
  return role === 'Super Admin' || role === 'Admin';
}

/** Singleton owner role — at most one profile in the org. */
export function isSuperAdminOnly(role: string | null | undefined): boolean {
  return role === 'Super Admin';
}

export function canCreateProject(role: string | null | undefined): boolean {
  return isOrgAdmin(role);
}

/** @deprecated Use isOrgAdmin for privilege checks. */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return isOrgAdmin(role);
}

export const INVITE_PROFILE_ROLES = [
  'Super Admin',
  'Admin',
  'Sales Manager',
  'Collection Agent',
  'CRM Executive',
  'Read Only'
] as const;

export function inviteProfileRoles(options: {
  inviterRole: string | null | undefined;
  superAdminExists: boolean;
}): string[] {
  return INVITE_PROFILE_ROLES.filter((role) => {
    if (role !== 'Super Admin') return true;
    return isSuperAdminOnly(options.inviterRole) && !options.superAdminExists;
  });
}
