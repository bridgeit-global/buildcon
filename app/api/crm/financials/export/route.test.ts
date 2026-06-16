import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireProjectAccess, createSupabaseServerClient } = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient
}));

import { GET } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { getUrl } from '@/test/mocks/route-helpers';
import { NextRequest } from 'next/server';

describe('GET /api/crm/financials/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
  });

  it('returns 400 for invalid export kind', async () => {
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseClient());

    const req = new NextRequest(getUrl('/api/crm/financials/export', { kind: 'unknown' }));
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid kind' });
  });

  it('returns auth error when project access is denied', async () => {
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseClient());
    requireProjectAccess.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const req = new NextRequest(
      getUrl('/api/crm/financials/export', { kind: 'ledger', projectId: 'proj-1' })
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns CSV for empty ledger export', async () => {
    createSupabaseServerClient.mockResolvedValue(
      createMockSupabaseClient({
        tables: {
          projects: { data: [{ id: 'proj-1', name: 'Demo Project' }], error: null },
          v_payment_schedule_outstanding: { data: [], error: null }
        }
      })
    );

    const req = new NextRequest(
      getUrl('/api/crm/financials/export', { kind: 'ledger', projectId: 'proj-1' })
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('project_id');
  });

  it('returns CSV for empty receipts export', async () => {
    createSupabaseServerClient.mockResolvedValue(
      createMockSupabaseClient({
        tables: {
          projects: { data: [{ id: 'proj-1', name: 'Demo Project' }], error: null },
          bookings: { data: [], error: null }
        }
      })
    );

    const req = new NextRequest(
      getUrl('/api/crm/financials/export', { kind: 'receipts', projectId: 'proj-1' })
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});
