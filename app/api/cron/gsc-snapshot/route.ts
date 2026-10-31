import { NextRequest, NextResponse } from 'next/server';
import { ingestGscDaily } from '../../../../lib/seo/history';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Щоденний зріз Search Console у gsc_daily.
 *
 * Беремо вікно ширше за добу: Google добирає дані заднім числом кілька діб,
 * тому перезаписуємо останній тиждень цілком — так пропущений або неповний
 * запуск не лишає дірки в історії.
 *
 * ?days=N — разовий добір історії (GSC тримає 16 місяців).
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 7), 1), 480);
  try {
    const res = await ingestGscDaily(days);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Збій крона раніше бачили лише в логах Vercel (аудит 31.10.2026): тепер і
// виняток, і відповідь 5xx ідуть алертом у Telegram (з тротлінгом, lib/alert).
export async function GET(req: NextRequest) {
  try {
    const res = await run(req);
    if (res.status >= 500) alertAdmin('Cron: знімок GSC — збій', `HTTP ${res.status}`);
    return res;
  } catch (err) {
    alertAdmin('Cron: знімок GSC впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
