import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { requireProjectAccess, isReadOnlyUser } = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  isReadOnlyUser: vi.fn()
}));

vi.mock('@/lib/authz', () => ({
  requireProjectAccess,
  isReadOnlyUser
}));

import { POST } from './route';
import { postJson, readJson } from '@/test/mocks/route-helpers';

const validBody = {
  projectId: 'proj-1',
  unitId: 'unit-1',
  customerId: 'cust-1',
  paymentMode: 'Cash',
  bookingAmount: 100000
};

describe('POST /api/crm/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: false });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(postJson({ projectId: 'proj-1' }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Missing fields' });
  });

  it('returns auth error shape when project access is denied', async () => {
    requireProjectAccess.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });

    const res = await POST(postJson(validBody));
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 for read-only users', async () => {
    isReadOnlyUser.mockResolvedValue({ ok: true, readOnly: true });

    const res = await POST(postJson(validBody));
    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when payment mode is missing', async () => {
    const res = await POST(
      postJson({ ...validBody, paymentMode: '' })
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Payment mode is required' });
  });

  it('returns 400 when UPI mode lacks UTR', async () => {
    const res = await POST(
      postJson({ ...validBody, paymentMode: 'UPI', paymentDetail: {} })
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Enter UPI UTR' });
  });

  it('returns 400 when booking amount is not positive', async () => {
    const res = await POST(
      postJson({ ...validBody, bookingAmount: 0 })
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Enter a positive booking amount' });
  });

  it('returns 400 when Home Loan mode lacks bank', async () => {
    const res = await POST(
      postJson({ ...validBody, paymentMode: 'Home Loan', loanBank: '' })
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: 'Select the loan or sanctioning bank'
    });
  });
});
