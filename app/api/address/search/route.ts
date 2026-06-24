import { NextRequest, NextResponse } from 'next/server';
import { searchLocations } from '@/lib/address/forward-geocode';

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: 'Query is too long.' }, { status: 400 });
  }

  const results = await searchLocations(q);
  return NextResponse.json({ results });
}
