import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  requireProjectAccess,
  isReadOnlyUser,
  createSupabaseAdminClient,
  loadBookingPrintPack,
  persistGeneratedBookingDocumentServer
} = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadBookingPrintPack: vi.fn(),
  persistGeneratedBookingDocumentServer: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient
}));

vi.mock('@/lib/booking/load-booking-print-pack', () => ({
  loadBookingPrintPack
}));

vi.mock('@/lib/booking/persist-generated-booking-document-server', () => ({
  persistGeneratedBookingDocumentServer
}));

import { POST } from './route';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const params = Promise.resolve({ caseId: 'case-1' });

describe('POST /api/crm/possession/[caseId]/stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
    loadBookingPrintPack.mockResolvedValue({ ok: false });
    persistGeneratedBookingDocumentServer.mockResolvedValue({ ok: false });
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

  it('returns 400 for invalid stage', async () => {
    const res = await POST(postJson({ stage: 'Invalid' }), { params });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid stage' });
  });

  it('returns 404 when case is not found', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: { possession_cases: { data: null, error: null } }
      })
    );

    const res = await POST(postJson({ stage: 'OC' }), { params });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'Case not found' });
  });

  it('returns 403 for read-only users', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          possession_cases: {
            data: {
              id: 'case-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              booking_id: 'booking-1',
              workflow_stage: 'OC',
              keys_handed_over_at: null,
              units: { status: 'BOOKED' }
            },
            error: null
          }
        }
      })
    );
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson({ stage: 'OC' }), { params });
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns ok payload when stage is updated', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createMockSupabaseClient({
        tables: {
          possession_cases: {
            data: {
              id: 'case-1',
              project_id: 'proj-1',
              unit_id: 'unit-1',
              booking_id: 'booking-1',
              workflow_stage: 'OC',
              keys_handed_over_at: null,
              units: { status: 'BOOKED' }
            },
            error: null
          }
        },
        rpc: {
          set_unit_status_for_booking: { data: null, error: null }
        }
      })
    );

    const res = await POST(postJson({ stage: 'OC' }), { params });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, stage: 'OC' });
  });
});
