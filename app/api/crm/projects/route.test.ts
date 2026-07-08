import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createSupabaseServerClient, createSupabaseAdminClient, requireOrgAdmin } =
  vi.hoisted(() => ({
    createSupabaseServerClient: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    requireOrgAdmin: vi.fn()
  }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return {
    ...actual,
    requireOrgAdmin
  };
});

import { GET, POST } from './route';
import { NextRequest } from 'next/server';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

function projectsGetRequest() {
  return new NextRequest('http://localhost/api/crm/projects');
}

describe('GET /api/crm/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    createSupabaseServerClient.mockResolvedValue(
      createMockSupabaseClient({
        auth: {
          getUser: async () => ({ data: { user: null }, error: null })
        }
      })
    );

    const res = await GET(projectsGetRequest());
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'Unauthorized' });
  });

  it('returns projects list for authenticated user', async () => {
    createSupabaseServerClient.mockResolvedValue(
      createMockSupabaseClient({
        auth: {
          getUser: async () => ({
            data: { user: { id: 'user-1', email: 'a@example.com' } },
            error: null
          })
        },
        tables: {
          profiles: { data: { role: 'Super Admin' }, error: null },
          projects: {
            data: [
              {
                id: 'proj-1',
                name: 'Demo',
                location: null,
                type: 'Residential',
                status: 'Active',
                fy: null,
                rera_no: null,
                floors_per_wing: 10,
                units_per_floor: 4,
                base_rate: 5000,
                min_rate: null,
                max_rate: null,
                parking_slots: null,
                parking_rate: null
              }
            ],
            error: null
          },
          project_wings: { data: [], error: null },
          project_members: { data: [], error: null }
        }
      })
    );

    const res = await GET(projectsGetRequest());
    expect(res.status).toBe(200);
    const json = await readJson<{ projects: unknown[]; canCreateProject: boolean }>(res);
    expect(json.projects).toHaveLength(1);
    expect(json.canCreateProject).toBe(true);
  });

  it('returns canCreateProject true for Admin role', async () => {
    createSupabaseServerClient.mockResolvedValue(
      createMockSupabaseClient({
        auth: {
          getUser: async () => ({
            data: { user: { id: 'user-1', email: 'a@example.com' } },
            error: null
          })
        },
        tables: {
          profiles: { data: { role: 'Admin' }, error: null },
          projects: { data: [], error: null }
        }
      })
    );

    const res = await GET(projectsGetRequest());
    expect(res.status).toBe(200);
    const json = await readJson<{ canCreateProject: boolean }>(res);
    expect(json.canCreateProject).toBe(true);
  });
});

describe('POST /api/crm/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth error when caller cannot create projects', async () => {
    requireOrgAdmin.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const res = await POST(postJson({ project: { name: 'New Project' } }));
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when project name is missing', async () => {
    requireOrgAdmin.mockResolvedValue({ ok: true, userId: 'admin-1' });

    const res = await POST(postJson({ project: {} }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Missing project name' });
  });

  it('returns 409 when project name already exists', async () => {
    requireOrgAdmin.mockResolvedValue({ ok: true, userId: 'admin-1' });
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          projects: {
            data: [{ id: 'proj-1', name: 'Existing Project' }],
            error: null
          }
        }
      })
    );

    const res = await POST(postJson({ project: { name: 'existing project' } }));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({
      error: 'A project with this name already exists.'
    });
  });
});
