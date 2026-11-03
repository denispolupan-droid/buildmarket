import { NextRequest, NextResponse } from 'next/server';
import { syncAdsSpend, uploadOrderConversions } from '../../../../lib/google-ads';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { withApi } from '../../../../lib/api-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Щоденний крон Google Ads (розклад — vercel.json):
 *  1) витрати → ads_spend (Фінанси → «Реклама», ROMI). Тягнемо 7 днів назад:
 *     Ads дозаписує конверсії та коригування заднім числом, upsert по
 *     (date, campaign_id) робить це безпечним;
 *  2) офлайн-конверсії: замовлення з gclid → Ads (журнал ads_conversions).
 * Кроки незалежні: збій одного не блокує інший, обидва звітують окремо.
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const out: Record<string, unknown> = {};
  let ok = true;
  try { out.spend = await syncAdsSpend(7); } catch (e) { ok = false; out.spendError = msg(e); }
  try { out.conversions = await uploadOrderConversions(); } catch (e) { ok = false; out.conversionsError = msg(e); }
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 500 });
}

// Збій крона раніше бачили лише в логах Vercel (аудит 31.10.2026): тепер і
// виняток, і відповідь 5xx ідуть алертом у Telegram (з тротлінгом, lib/alert).
async function _GET(req: NextRequest) {
  try {
    const res = await run(req);
    if (res.status >= 500) alertAdmin('Cron: витрати Google Ads — збій', `HTTP ${res.status}`);
    return res;
  } catch (err) {
    alertAdmin('Cron: витрати Google Ads впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = withApi('cron/ads-spend', _GET);
