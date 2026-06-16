import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  requireProjectAccess,
  isReadOnlyUser,
  createSupabaseAdminClient,
  syncProjectBookingPaymentSchedules
} = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  syncProjectBookingPaymentSchedules: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/lib/booking/booking-schedule', () => ({
  syncProjectBookingPaymentSchedules
}));

import { POST } from './route';
import { readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ projectId: 'proj-1' });

describe('POST /api/crm/projects/[projectId]/cld/sync-schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
    createSupabaseAdminClient.mockReturnValue({});
    syncProjectBookingPaymentSchedules.mockResolvedValue({ updated: 2, skipped: 1 });
  });

  it('returns auth error when project access is denied', async () => {
    requireProjectAccess.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const res = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params
    });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 for read-only users', async () => {
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params
    });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns sync summary on success', async () => {
    const res = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params
    });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, updated: 2, skipped: 1 });
  });

  it('returns 500 when sync throws', async () => {
    syncProjectBookingPaymentSchedules.mockRejectedValue(new Error('Sync failed'));

    const res = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params
    });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Sync failed' });
  });
});
