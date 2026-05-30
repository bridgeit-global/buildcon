import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { processPendingCldDemandLetterJobs } from '@/lib/booking/process-cld-demand-letter-jobs';

export async function POST(request: Request) {
  const token = request.headers.get('x-job-token');
  const expected = process.env.JOB_TRIGGER_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 5), 1), 25);

  const admin = createSupabaseAdminClient();
  const data = await processPendingCldDemandLetterJobs(admin, limit);
  return NextResponse.json({ ok: true, data });
}
