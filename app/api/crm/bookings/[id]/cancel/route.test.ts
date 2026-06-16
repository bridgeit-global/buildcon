import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  requireProjectAccess,
  isReadOnlyUser,
  createSupabaseAdminClient,
  sumCollectionsForBooking
} = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  sumCollectionsForBooking: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/lib/booking/booking-schedule', () => ({
  sumCollectionsForBooking
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ id: 'booking-1' });

describe('POST /api/crm/bookings/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
    sumCollectionsForBooking.mockResolvedValue(0);
  });

  it('returns 400 when reason is missing', async () => {
    const res = await POST(postJson({ reason: '' }), { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Cancellation reason is required' });
  });

  it('returns 404 when booking is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { bookings: { data: null, error: null } }
      })
    );

    const res = await POST(postJson({ reason: 'Customer withdrew' }), { params });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Booking not found' });
  });

  it('returns 409 when booking is already cancelled', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          bookings: {
            data: {
              id: 'booking-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              status: 'cancelled',
              workflow_stage: 'token'
            },
            error: null
          }
        }
      })
    );

    const res = await POST(postJson({ reason: 'Duplicate request' }), { params });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'Booking is already cancelled' });
  });

  it('returns 403 for read-only users', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          bookings: {
            data: {
              id: 'booking-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              status: 'active',
              workflow_stage: 'token'
            },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson({ reason: 'Customer withdrew' }), { params });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });
});
