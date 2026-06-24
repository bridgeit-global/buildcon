import { NextRequest, NextResponse } from 'next/server';
import { buildIlikeOrFilter } from '@/lib/crm/list-search';
import { resolveDbSort } from '@/lib/crm/list-sort';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz';

const BROKER_SELECT = 'id,full_name,phone,email,license_no,status,created_at';

const SORTABLE_COLUMNS: Record<string, string> = {
  full_name: 'full_name',
  phone: 'phone',
  email: 'email',
  license_no: 'license_no',
  status: 'status',
  created_at: 'created_at'
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 300;

function parseLimit(raw: string | null): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(10, n));
}

function parseOffset(raw: string | null): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = request.nextUrl;
  const limit = parseLimit(searchParams.get('limit'));
  const offset = parseOffset(searchParams.get('offset'));
  const q = (searchParams.get('q') || '').trim();
  const { column, ascending } = resolveDbSort(
    searchParams.get('sort'),
    searchParams.get('sortDir'),
    SORTABLE_COLUMNS,
    'created_at',
    false
  );

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('brokers')
    .select(BROKER_SELECT, { count: offset === 0 ? 'exact' : 'estimated' })
    .order(column, { ascending })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(
      buildIlikeOrFilter(
        ['full_name', 'phone', 'email', 'license_no'],
        q
      )
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];
  return NextResponse.json({
    items,
    hasMore: items.length === limit,
    nextOffset: offset + items.length,
    total: offset === 0 && count != null ? count : null
  });
}
