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

const params = Promise.resolve({ id: 'inquiry-1' });

describe('POST /api/crm/inquiries/[id]/token/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
  });

  it('returns 404 when inquiry is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { sales_inquiries: { data: null, error: null } }
      })
    );

    const res = await POST(postJson({}), { params });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Inquiry not found' });
  });

  it('returns 409 when inquiry is missing project/unit/customer', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: {
              id: 'inquiry-1',
              project_id: null,
              customer_id: null,
              unit_id: null,
              funnel_stage: 'Token',
              stage_data: {}
            },
            error: null
          }
        }
      })
    );

    const res = await POST(postJson({}), { params });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toMatchObject({
      error: expect.stringContaining('missing project / unit / customer')
    });
  });

  it('returns 403 for read-only users', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: {
              id: 'inquiry-1',
              project_id: 'proj-1',
              customer_id: 'cust-1',
              unit_id: 'unit-1',
              funnel_stage: 'Token',
              stage_data: {}
            },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson({}), { params });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns existing booking when one already exists', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tableHandler: ({ table }) => {
          if (table === 'sales_inquiries') {
            return {
              data: {
                id: 'inquiry-1',
                project_id: 'proj-1',
                customer_id: 'cust-1',
                unit_id: 'unit-1',
                funnel_stage: 'Token',
                stage_data: {}
              },
              error: null
            };
          }
          if (table === 'bookings') {
            return {
              data: { id: 'booking-existing', workflow_stage: 'token' },
              error: null
            };
          }
        }
      })
    );

    const res = await POST(postJson({}), { params });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({
      ok: true,
      bookingId: 'booking-existing',
      created: false
    });
  });
});
