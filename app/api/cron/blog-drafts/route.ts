import { NextRequest, NextResponse } from 'next/server';
import { runAutodraft } from '../../../../lib/blog-autodraft';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { reportAiFailure } from '../../../../lib/ai-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Автопілот контенту (lib/blog-autodraft): одна чернетка статті з черги
 * «Невидимого попиту», лист у поштову скриньку замовлень. Розклад — vercel.json:
 * з 04.10.2026 двічі на місяць (1-го і 15-го) за рішенням власника — заради
 * витрат (~$0,20 за статтю); до того було пн–сб.
 * ?dry=1 — лише вибір тем без генерації (перевірка добору).
 * Гальма — app_settings.blog_autodraft_per_run / blog_autodraft_weekly_cap.
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runAutodraft({ dry: req.nextUrl.searchParams.get('dry') === '1' });
    // Помилки автопілота текстові — якщо серед них баланс/ключ Anthropic, власник дізнається окремо
    if (result.errors.length) await reportAiFailure(new Error(result.errors.join(' | ')), 'автопілот статей блогу');
    return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 207 : 200 });
  } catch (e) {
    await reportAiFailure(e, 'автопілот статей блогу');
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Збій крона раніше бачили лише в логах Vercel (аудит 31.10.2026): тепер і
// виняток, і відповідь 5xx ідуть алертом у Telegram (з тротлінгом, lib/alert).
export async function GET(req: NextRequest) {
  try {
    const res = await run(req);
    if (res.status >= 500) alertAdmin('Cron: чернетки блогу — збій', `HTTP ${res.status}`);
    return res;
  } catch (err) {
    alertAdmin('Cron: чернетки блогу впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
