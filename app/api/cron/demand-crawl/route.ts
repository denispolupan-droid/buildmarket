import { NextRequest, NextResponse } from 'next/server';
import { crawlDemand } from '../../../../lib/seo/demand-crawl';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { withApi } from '../../../../lib/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * Щотижневий обхід автопідказок Google по всіх категоріях (uk+ru) —
 * наповнює search_demand для вкладки «Попит» → «Невидимий попит».
 * ~75 категорій × 2 мови × 11 модифікаторів ≈ 1 650 запитів із паузою
 * 120 мс — 5–6 хвилин; перший обхід зайняв 343 с, тому maxDuration 800 (Fluid). Розклад — vercel.json.
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await crawlDemand();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Збій крона раніше бачили лише в логах Vercel (аудит 31.10.2026): тепер і
// виняток, і відповідь 5xx ідуть алертом у Telegram (з тротлінгом, lib/alert).
async function _GET(req: NextRequest) {
  try {
    const res = await run(req);
    if (res.status >= 500) alertAdmin('Cron: збір попиту — збій', `HTTP ${res.status}`);
    return res;
  } catch (err) {
    alertAdmin('Cron: збір попиту впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = withApi('cron/demand-crawl', _GET);
