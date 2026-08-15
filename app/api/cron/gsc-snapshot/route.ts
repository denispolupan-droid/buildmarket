import { NextRequest, NextResponse } from 'next/server';
import { ingestGscDaily } from '../../../../lib/seo/history';

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
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
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
