import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  requireProjectAccess,
  isReadOnlyUser,
  createSupabaseAdminClient,
  persistNegotiationApprovalRequest,
  listSuperAdminUserIds,
  notifyManyCrmUsers
} = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  persistNegotiationApprovalRequest: vi.fn(),
  listSuperAdminUserIds: vi.fn(),
  notifyManyCrmUsers: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/app/crm/inquiry/inquiry-stage-store', () => ({
  persistNegotiationApprovalRequest
}));

vi.mock('@/lib/notifications/crm-staff-notification', () => ({
  listSuperAdminUserIds,
  notifyManyCrmUsers,
  staffNotificationEmailHtml: vi.fn(() => '<p>email</p>')
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ id: 'inquiry-1' });

describe('POST /api/crm/inquiries/[id]/negotiation/request-approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
    persistNegotiationApprovalRequest.mockResolvedValue({ ok: true });
    listSuperAdminUserIds.mockResolvedValue(['admin-1']);
    notifyManyCrmUsers.mockResolvedValue({ inAppCount: 1, emailsSent: 1 });
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad'
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 404 when inquiry is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { sales_inquiries: { data: null, error: null } }
      })
    );

    const res = await POST(
      postJson({ listPriceInr: 1000000, discountInr: '50000' }),
      { params }
    );
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Inquiry not found' });
  });

  it('returns 400 when discount is missing', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: {
              id: 'inquiry-1',
              project_id: 'proj-1',
              customer_id: 'cust-1',
              unit_id: 'unit-1',
              funnel_stage: 'Negotiation'
            },
            error: null
          }
        }
      })
    );

    const res = await POST(postJson({ listPriceInr: 1000000 }), { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: 'Enter a discount amount or percentage below list price.'
    });
  });

  it('returns 400 when discount exceeds cap', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: {
              id: 'inquiry-1',
              project_id: 'proj-1',
              customer_id: 'cust-1',
              unit_id: 'unit-1',
              funnel_stage: 'Negotiation'
            },
            error: null
          }
        }
      })
    );

    const res = await POST(
      postJson({ listPriceInr: 1000000, discountPct: '60' }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: 'Discount cannot exceed 50%.'
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
              funnel_stage: 'Negotiation'
            },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(
      postJson({ listPriceInr: 1000000, discountInr: '50000' }),
      { params }
    );
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });
});
