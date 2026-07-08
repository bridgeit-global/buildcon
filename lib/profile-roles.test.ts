import { describe, expect, it } from 'vitest';
import {
  canCreateProject,
  inviteProfileRoles,
  isOrgAdmin,
  isSuperAdminOnly
} from './profile-roles';

describe('isOrgAdmin', () => {
  it('includes Super Admin and Admin', () => {
    expect(isOrgAdmin('Super Admin')).toBe(true);
    expect(isOrgAdmin('Admin')).toBe(true);
    expect(isOrgAdmin('CRM Executive')).toBe(false);
  });
});

describe('isSuperAdminOnly', () => {
  it('matches only Super Admin', () => {
    expect(isSuperAdminOnly('Super Admin')).toBe(true);
    expect(isSuperAdminOnly('Admin')).toBe(false);
  });
});

describe('canCreateProject', () => {
  it('matches org admin roles', () => {
    expect(canCreateProject('Admin')).toBe(true);
    expect(canCreateProject('Sales Manager')).toBe(false);
  });
});

describe('inviteProfileRoles', () => {
  it('hides Super Admin when one already exists', () => {
    expect(
      inviteProfileRoles({ inviterRole: 'Super Admin', superAdminExists: true })
    ).not.toContain('Super Admin');
  });

  it('shows Super Admin to Super Admin when none exists', () => {
    expect(
      inviteProfileRoles({ inviterRole: 'Super Admin', superAdminExists: false })
    ).toContain('Super Admin');
  });

  it('never shows Super Admin to Admin inviter', () => {
    expect(
      inviteProfileRoles({ inviterRole: 'Admin', superAdminExists: false })
    ).not.toContain('Super Admin');
  });
});
