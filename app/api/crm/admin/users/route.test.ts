import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireOrgAdmin, createSupabaseAdminClient, getProfileRole, isSuperAdminOnly } =
  vi.hoisted(() => ({
    requireOrgAdmin: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    getProfileRole: vi.fn(),
    isSuperAdminOnly: vi.fn()
  }));

vi.mock('@/lib/authz', () => ({
  requireOrgAdmin,
  getProfileRole,
  isSuperAdminOnly
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

describe('POST /api/crm/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgAdmin.mockResolvedValue({ ok: true, userId: 'admin-1' });
    getProfileRole.mockResolvedValue({ ok: true, role: 'Super Admin' });
    isSuperAdminOnly.mockReturnValue(true);
  });

  it('returns auth error when caller is not super admin', async () => {
    requireOrgAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const res = await POST(
      postJson({
        email: 'new@example.com',
        name: 'New User',
        profileRole: 'CRM Executive',
        projectIds: []
      })
    );
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when email is missing', async () => {
    const res = await POST(
      postJson({
        email: '',
        profileRole: 'CRM Executive',
        projectIds: []
      })
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Email is required' });
  });

  it('returns 500 when invite fails', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        auth: {
          admin: {
            inviteUserByEmail: async () => ({
              data: { user: null },
              error: { message: 'Invite failed' }
            })
          }
        }
      })
    );

    const res = await POST(
      postJson({
        email: 'new@example.com',
        name: 'New User',
        profileRole: 'CRM Executive',
        projectIds: []
      })
    );
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Invite failed' });
  });

  it('returns 409 when inviting a second Super Admin', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          profiles: { data: [{ id: 'existing-super' }], error: null, count: 1 }
        }
      })
    );

    const res = await POST(
      postJson({
        email: 'owner2@example.com',
        name: 'Owner 2',
        profileRole: 'Super Admin',
        projectIds: []
      })
    );
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'Only one Super Admin is allowed' });
  });

  it('returns 403 when Admin tries to invite Super Admin', async () => {
    getProfileRole.mockResolvedValue({ ok: true, role: 'Admin' });
    isSuperAdminOnly.mockReturnValue(false);

    const res = await POST(
      postJson({
        email: 'owner2@example.com',
        name: 'Owner 2',
        profileRole: 'Super Admin',
        projectIds: []
      })
    );
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({
      error: 'Only the Super Admin can assign the Super Admin role'
    });
  });

  it('returns userId on successful invite', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        auth: {
          admin: {
            inviteUserByEmail: async () => ({
              data: { user: { id: 'invited-user-id' } },
              error: null
            })
          }
        },
        tables: {
          profiles: { data: { id: 'invited-user-id' }, error: null },
          project_members: { data: [], error: null }
        }
      })
    );

    const res = await POST(
      postJson({
        email: 'new@example.com',
        name: 'New User',
        profileRole: 'CRM Executive',
        projectIds: ['proj-1']
      })
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ userId: 'invited-user-id' });
  });
});
