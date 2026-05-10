import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase Auth guard for /crm
  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isCrmRoute = pathname === '/crm' || pathname.startsWith('/crm/');
  const isAuthRoute =
    pathname === '/' || pathname === '/login' || pathname === '/logout';

  const carryCookies = (to: NextResponse) => {
    response.cookies.getAll().forEach((c) => {
      to.cookies.set(c.name, c.value, c);
    });
    return to;
  };

  if (isCrmRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('redirectTo', pathname);
    return carryCookies(NextResponse.redirect(url));
  }

  if ((pathname === '/' || pathname === '/login') && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/crm';
    url.searchParams.delete('redirectTo');
    return carryCookies(NextResponse.redirect(url));
  }

  if (isAuthRoute) return response;

  // On the root domain, allow normal access (with refreshed cookies if any).
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. all root files inside /public (e.g. /favicon.ico)
     */
    '/((?!api|_next|[\\w-]+\\.\\w+).*)'
  ]
};
