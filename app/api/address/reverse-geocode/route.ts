import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocode } from '@/lib/address/reverse-geocode';

function parseCoord(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoord(searchParams.get('lat'));
  const lon = parseCoord(searchParams.get('lon'));

  if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  }

  const result = await reverseGeocode(lat, lon);
  if (!result) {
    return NextResponse.json(
      { error: 'Could not resolve location for these coordinates.' },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
