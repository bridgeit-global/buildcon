import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireSuperAdmin, createSupabaseAdminClient } = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireSuperAdmin
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
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1' });
  });

  it('returns auth error when caller is not super admin', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const res = await POST(
      postJson({
        email: 'new@example.com',
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
        profileRole: 'CRM Executive',
        projectIds: []
      })
    );
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Invite failed' });
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
        profileRole: 'CRM Executive',
        projectIds: ['proj-1']
      })
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ userId: 'invited-user-id' });
  });
});
