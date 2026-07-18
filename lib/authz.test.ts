import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient
}));

import {
  getProfileRole,
  isSuperAdmin,
  isOrgAdmin,
  isSuperAdminOnly,
  canCreateProject,
  requireProjectAccess,
  requireOrgAdmin,
  requireUser
} from './authz';
import { createMockSupabaseClient } from '@/test/mocks/supabase';

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth returns an error', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'JWT expired' } })
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireUser();
    expect(result).toEqual({ ok: false, status: 401, error: 'JWT expired' });
  });

  it('returns 401 when user is missing', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null })
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireUser();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns userId on success', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-abc', email: 'a@example.com' } },
          error: null
        })
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireUser();
    expect(result).toEqual({ ok: true, userId: 'user-abc' });
  });
});

describe('getProfileRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 on query error', async () => {
    const client = createMockSupabaseClient({
      tables: {
        profiles: { data: null, error: { message: 'db down' } }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getProfileRole('user-abc');
    expect(result).toEqual({ ok: false, status: 500, error: 'db down' });
  });

  it('returns role on success', async () => {
    const client = createMockSupabaseClient({
      tables: {
        profiles: { data: { role: 'Sales Manager' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getProfileRole('user-abc');
    expect(result).toEqual({ ok: true, role: 'Sales Manager' });
  });
});

describe('isOrgAdmin', () => {
  it('includes Super Admin and Admin', () => {
    expect(isOrgAdmin('Super Admin')).toBe(true);
    expect(isOrgAdmin('Admin')).toBe(true);
    expect(isOrgAdmin('Sales Manager')).toBe(false);
    expect(isOrgAdmin(null)).toBe(false);
  });
});

describe('isSuperAdminOnly', () => {
  it('matches Super Admin role only', () => {
    expect(isSuperAdminOnly('Super Admin')).toBe(true);
    expect(isSuperAdminOnly('Admin')).toBe(false);
    expect(isSuperAdminOnly(null)).toBe(false);
  });
});

describe('isSuperAdmin', () => {
  it('is an alias for isOrgAdmin', () => {
    expect(isSuperAdmin('Super Admin')).toBe(true);
    expect(isSuperAdmin('Admin')).toBe(true);
    expect(isSuperAdmin('Sales Manager')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe('canCreateProject', () => {
  it('allows Super Admin and Admin', () => {
    expect(canCreateProject('Super Admin')).toBe(true);
    expect(canCreateProject('Admin')).toBe(true);
    expect(canCreateProject('CRM Executive')).toBe(false);
    expect(canCreateProject(null)).toBe(false);
  });
});

describe('requireOrgAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin roles', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-abc' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Read Only' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireOrgAdmin();
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('returns userId for Super Admin', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'admin-1' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Super Admin' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireOrgAdmin();
    expect(result).toEqual({ ok: true, userId: 'admin-1' });
  });

  it('returns userId for Admin', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'admin-user' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Admin' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireOrgAdmin();
    expect(result).toEqual({ ok: true, userId: 'admin-user' });
  });
});

describe('requireProjectAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is not a project member', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-abc' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'CRM Executive' }, error: null },
        project_members: { data: null, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireProjectAccess('proj-1');
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('allows Super Admin without membership row', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'admin-1' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Super Admin' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireProjectAccess('proj-1');
    expect(result).toEqual({ ok: true, userId: 'admin-1', isSuperAdmin: true });
  });

  it('denies Admin without membership row', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'admin-2' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Admin' }, error: null },
        project_members: { data: null, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireProjectAccess('proj-1');
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('allows Admin with active membership', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'admin-2' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'Admin' }, error: null },
        project_members: { data: { project_id: 'proj-1' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireProjectAccess('proj-1');
    expect(result).toEqual({ ok: true, userId: 'admin-2', isSuperAdmin: false });
  });

  it('allows active project member', async () => {
    const client = createMockSupabaseClient({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-abc' } },
          error: null
        })
      },
      tables: {
        profiles: { data: { role: 'CRM Executive' }, error: null },
        project_members: { data: { project_id: 'proj-1' }, error: null }
      }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await requireProjectAccess('proj-1');
    expect(result).toEqual({ ok: true, userId: 'user-abc', isSuperAdmin: false });
  });
});
