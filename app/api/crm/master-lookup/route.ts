import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import { isMasterLookupKind } from '@/lib/master/master-lookup';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const MASTER_LOOKUP_SELECT =
  'id,kind,name,sort_order,is_active,created_at';

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = request.nextUrl;
  const kind = (searchParams.get('kind') || '').trim();
  const includeInactive = searchParams.get('includeInactive') === '1';

  if (kind && !isMasterLookupKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('master_lookup_items')
    .select(MASTER_LOOKUP_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (kind) query = query.eq('kind', kind);
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
