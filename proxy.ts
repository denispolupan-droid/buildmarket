import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ── Simple in-process rate limiter (resets per cold-start, but enough for basic abuse protection) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: { path: string; max: number; windowMs: number }[] = [
  { path: '/api/orders',      max: 5,  windowMs: 10 * 60_000 }, // 5 замовлень / 10 хв
  { path: '/api/novaposhta',  max: 60, windowMs: 60_000 },       // 60 запитів / хв
  { path: '/api/notify-stock',max: 10, windowMs: 60_000 },
  { path: '/login',           max: 10, windowMs: 60_000 },
  { path: '/register',        max: 5,  windowMs: 60_000 },
];

function checkRateLimit(ip: string, pathname: string): boolean {
  const rule = RATE_LIMITS.find(r => pathname.startsWith(r.path));
  if (!rule) return true;
  const key = `${ip}:${rule.path}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= rule.max;
}

const PROTECTED_ROUTES = ['/account', '/admin'];
const PUBLIC_OVERRIDES = ['/account/wishlist'];
const WHOLESALE_ROUTES = ['/catalog'];
const AUTH_ROUTES = ['/login', '/register'];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Inject x-pathname so server components (layout, Footer, Header) can detect language
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  const nextWithPathname = { request: { headers: requestHeaders } };

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  if (!checkRateLimit(ip, pathname)) {
    return new NextResponse('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
  }

  if (PUBLIC_OVERRIDES.some(route => pathname.startsWith(route))) {
    return NextResponse.next(nextWithPathname);
  }

  const needsAuth =
    PROTECTED_ROUTES.some(route => pathname.startsWith(route)) ||
    WHOLESALE_ROUTES.some(route => pathname.startsWith(route)) ||
    AUTH_ROUTES.some(route => pathname.startsWith(route));

  if (!needsAuth) {
    return NextResponse.next(nextWithPathname);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    if (user) {
      const next        = request.nextUrl.searchParams.get('next');
      const accountType = user.user_metadata?.account_type as string | undefined;
      const role        = user.user_metadata?.role as string | undefined;
      // Редирект залежно від ролі
      if (next) return NextResponse.redirect(new URL(next, request.url));
      if (accountType === 'dropship') return NextResponse.redirect(new URL('/cabinet', request.url));
      if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (WHOLESALE_ROUTES.some(route => pathname.startsWith(route))) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(redirectUrl);
    }
    const accountType = user.user_metadata?.account_type as string | undefined;
    const isWholesale = ['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(accountType ?? '');
    if (!isWholesale) {
      const category = request.nextUrl.searchParams.get('category');
      const shopUrl = category ? `/shop?category=${category}` : '/shop';
      return NextResponse.redirect(new URL(shopUrl, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
