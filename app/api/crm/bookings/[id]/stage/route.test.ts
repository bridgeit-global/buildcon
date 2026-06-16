import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireProjectAccess, isReadOnlyUser, createSupabaseAdminClient } = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ id: 'booking-1' });

describe('POST /api/crm/bookings/[id]/stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
  });

  it('returns 404 when booking is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { bookings: { data: null, error: null } }
      })
    );

    const res = await POST(postJson({ action: 'save' }), { params });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Booking not found' });
  });

  it('returns 409 when booking is cancelled', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          bookings: {
            data: {
              id: 'booking-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              sales_inquiry_id: null,
              workflow_stage: 'token',
              stage: 'booking',
              stage_data: {},
              status: 'cancelled',
              booking_amount: 100000,
              payment_detail: {}
            },
            error: null
          }
        }
      })
    );

    const res = await POST(postJson({ action: 'save' }), { params });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'Booking is cancelled' });
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
              sales_inquiry_id: null,
              workflow_stage: 'token',
              stage: 'booking',
              stage_data: {},
              status: 'active',
              booking_amount: 100000,
              payment_detail: {}
            },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson({ action: 'save' }), { params });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 409 when saving locked token stage', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          bookings: {
            data: {
              id: 'booking-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              sales_inquiry_id: null,
              workflow_stage: 'token',
              stage: 'booking',
              stage_data: {
                token: {
                  amount: '100000',
                  date: '2026-01-01',
                  mode: 'Cash',
                  recorded_at: '2026-01-01T00:00:00.000Z'
                }
              },
              status: 'active',
              booking_amount: 100000,
              payment_detail: {}
            },
            error: null
          }
        }
      })
    );

    const res = await POST(
      postJson({ action: 'save', stageDataPatch: { amount: '200000' } }),
      { params }
    );
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({
      error: 'Token details cannot be changed after recording or confirmation.'
    });
  });
});
