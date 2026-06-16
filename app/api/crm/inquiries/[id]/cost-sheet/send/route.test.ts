import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  requireProjectAccess,
  isReadOnlyUser,
  createSupabaseAdminClient,
  sendInquiryCostSheetServer
} = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  sendInquiryCostSheetServer: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/lib/inquiry/send-inquiry-cost-sheet-server', () => ({
  sendInquiryCostSheetServer
}));

vi.mock('@/lib/booking/notify-generated-booking-document-server', () => ({
  toNotifyBookingDocumentResponse: (dispatch: unknown) => ({ dispatch })
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ id: 'inquiry-1' });

describe('POST /api/crm/inquiries/[id]/cost-sheet/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 when unitId is missing', async () => {
    const res = await POST(postJson({}), { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: 'Select a unit before sending the cost sheet.'
    });
  });

  it('returns 404 when inquiry is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { sales_inquiries: { data: null, error: null } }
      })
    );

    const res = await POST(postJson({ unitId: 'unit-1' }), { params });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Inquiry not found' });
  });

  it('returns 403 for read-only users', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: { id: 'inquiry-1', project_id: 'proj-1' },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson({ unitId: 'unit-1' }), { params });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 500 when cost sheet send fails', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          sales_inquiries: {
            data: { id: 'inquiry-1', project_id: 'proj-1' },
            error: null
          }
        }
      })
    );
    sendInquiryCostSheetServer.mockResolvedValue({ ok: false, error: 'SMTP failed' });

    const res = await POST(postJson({ unitId: 'unit-1' }), { params });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'SMTP failed' });
  });
});
