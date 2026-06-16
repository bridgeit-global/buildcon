import { describe, expect, it, vi } from 'vitest';
import { resolveCoBuyers } from '@/lib/booking/co-buyers';

function mockSupabase(rows: Array<Record<string, unknown>> | null, error?: string) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({
          data: rows,
          error: error ? { message: error } : null
        }))
      }))
    }))
  } as unknown as Parameters<typeof resolveCoBuyers>[0];
}

describe('resolveCoBuyers', () => {
  it('returns empty list when no co-buyer ids are provided', async () => {
    const result = await resolveCoBuyers(mockSupabase([]), 'primary', '9999999999', []);
    expect(result).toEqual({ coBuyers: [] });
  });

  it('returns co-buyers in requested order with relationships', async () => {
    const admin = mockSupabase([
      { id: 'c2', full_name: 'Jane Doe', phone: '8888888888', email: 'jane@example.com' },
      { id: 'c3', full_name: 'John Doe', phone: '7777777777', email: null }
    ]);

    const result = await resolveCoBuyers(
      admin,
      'primary',
      '9999999999',
      ['c3', 'c2'],
      { c3: ' Spouse ', c2: 'Sibling' }
    );

    expect(result.coBuyers).toEqual([
      {
        customer_id: 'c3',
        full_name: 'John Doe',
        phone: '7777777777',
        email: null,
        relationship: 'Spouse'
      },
      {
        customer_id: 'c2',
        full_name: 'Jane Doe',
        phone: '8888888888',
        email: 'jane@example.com',
        relationship: 'Sibling'
      }
    ]);
  });

  it('rejects duplicate phone with primary customer', async () => {
    const admin = mockSupabase([
      { id: 'c2', full_name: 'Jane', phone: '9999999999', email: null }
    ]);

    const result = await resolveCoBuyers(admin, 'primary', '9999999999', ['c2']);
    expect(result.error).toContain('same phone number as the primary customer');
    expect(result.coBuyers).toEqual([]);
  });

  it('rejects duplicate phone between co-applicants', async () => {
    const admin = mockSupabase([
      { id: 'c2', full_name: 'Jane', phone: '8888888888', email: null },
      { id: 'c3', full_name: 'John', phone: '8888888888', email: null }
    ]);

    const result = await resolveCoBuyers(admin, 'primary', '9999999999', ['c2', 'c3']);
    expect(result.error).toContain('cannot share the same phone number');
  });

  it('returns error when a co-buyer is missing', async () => {
    const admin = mockSupabase([
      { id: 'c2', full_name: 'Jane', phone: '8888888888', email: null }
    ]);

    const result = await resolveCoBuyers(admin, 'primary', '9999999999', ['c2', 'c3']);
    expect(result.error).toContain('not found');
  });

  it('returns database error from supabase', async () => {
    const result = await resolveCoBuyers(
      mockSupabase(null, 'db failure'),
      'primary',
      '9999999999',
      ['c2']
    );
    expect(result.error).toBe('db failure');
  });
});
