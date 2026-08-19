import { createServerClient } from '@supabase/ssr';
import { after, NextResponse, type NextRequest } from 'next/server';
import { detectAiBot, detectAiReferral } from './lib/ai-crawlers';
import { recordAiBotHit, recordAiReferral } from './lib/ai-visits';

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

// Старі товарні URL /product/{SKU} → 308 на ЧПУ-слаг. Робимо це в proxy, бо
// кореневий app/loading.tsx вмикає стрімінг і redirect() зі сторінки віддає
// статус 200 з meta refresh — Google це "м'який" редірект, а не справжній 308.
const LEGACY_PRODUCT_URL = /^\/(ru\/)?product\/(\d{4}-\d{3})$/;

async function legacyProductRedirect(request: NextRequest): Promise<NextResponse | null> {
  const m = request.nextUrl.pathname.match(LEGACY_PRODUCT_URL);
  if (!m) return null;
  const [, ruPrefix, sku] = m;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?sku=eq.${sku}&select=slug`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json() as { slug: string | null }[];
    const slug = rows?.[0]?.slug;
    if (!slug) return null;
    const url = request.nextUrl.clone();
    url.pathname = `/${ruPrefix ?? ''}product/${slug}`;
    return NextResponse.redirect(url, 308);
  } catch {
    return null; // сторінка сама зробить фолбек-редірект
  }
}

/**
 * Облік ШІ-трафіку: краулери ChatGPT/Gemini/Perplexity і переходи людей з їхніх
 * відповідей.
 *
 * Чому саме тут. Краулер не виконує JS — жодна клієнтська аналітика його не
 * бачить, тому єдине місце, де ці візити взагалі існують, — межа запиту.
 * Запис іде в after(): відповідь користувачу вже пішла, і повільна база не
 * додає ані мілісекунди до TTFB.
 */
function trackAiTraffic(request: NextRequest, pathname: string): void {
  // Увесь облік — під try/catch, і це не перестраховка. Функція стоїть на
  // ВХОДІ в proxy, тобто на кожному запиті сайту: виняток тут поклав би не
  // статистику, а весь сайт разом із головною і товарами. Лічильник відвідувань
  // такого права не має — при будь-якій несподіванці він мовчки зникає.
  try {
    // API і службові шляхи в статистиці лише шум: питання «що читає ШІ» — про
    // сторінки, а не про внутрішні виклики нашого ж фронтенду.
    if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return;

    const bot = detectAiBot(request.headers.get('user-agent'));
    if (bot) {
      after(() => recordAiBotHit(bot, pathname));
      return;
    }

    // Живий перехід рахуємо лише коли бота НЕ впізнали: інакше один візит
    // ChatGPT-User потрапив би в обидва звіти й покази змішалися б з кліками.
    const source = detectAiReferral(
      request.headers.get('referer'),
      request.nextUrl.searchParams.get('utm_source'),
    );
    if (source) after(() => recordAiReferral(source, pathname));
  } catch {
    // навмисно порожньо — див. коментар вище
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  trackAiTraffic(request, pathname);

  const legacyRedirect = await legacyProductRedirect(request);
  if (legacyRedirect) return legacyRedirect;

  // Inject x-pathname so server components (layout, Footer, Header) can detect language
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  const nextWithPathname = { request: { headers: requestHeaders } };

  // Rate limiting. Prefer x-real-ip (set by the trusted Vercel edge); for
  // x-forwarded-for take the LAST entry — leading entries are client-spoofable
  // and would let an attacker rotate the header to bypass the limit.
  const xff = request.headers.get('x-forwarded-for');
  const xffLast = xff?.split(',').map(s => s.trim()).filter(Boolean).pop();
  const ip = request.headers.get('x-real-ip')?.trim() ?? xffLast ?? 'unknown';
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
      const accountType = user.app_metadata?.account_type as string | undefined;
      const role        = user.app_metadata?.role as string | undefined;
      // Редирект залежно від ролі. `next` приймаємо ТІЛЬКИ як внутрішній шлях
      // (починається з одного «/»), інакше — open redirect на чужий домен.
      if (next && next.startsWith('/') && !next.startsWith('//'))
        return NextResponse.redirect(new URL(next, request.url));
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
    const accountType = user.app_metadata?.account_type as string | undefined;
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
