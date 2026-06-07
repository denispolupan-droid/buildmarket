import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  // Inject pathname so the root layout can set lang="ru" for /ru/* routes
  res.headers.set('x-pathname', request.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)'],
};
