import { NextRequest, NextResponse } from 'next/server';
import { runAutodraft } from '../../../../lib/blog-autodraft';
import { cronAuthorized } from '../../../../lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Автопілот контенту (lib/blog-autodraft): пн–сб одна чернетка статті з черги
 * «Невидимого попиту», лист у поштову скриньку замовлень. Розклад — vercel.json.
 * ?dry=1 — лише вибір тем без генерації (перевірка добору).
 * Гальма — app_settings.blog_autodraft_per_run / blog_autodraft_weekly_cap.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runAutodraft({ dry: req.nextUrl.searchParams.get('dry') === '1' });
    return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
