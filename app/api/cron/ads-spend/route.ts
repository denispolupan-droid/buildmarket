import { NextRequest, NextResponse } from 'next/server';
import { syncAdsSpend, uploadOrderConversions } from '../../../../lib/google-ads';

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
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const out: Record<string, unknown> = {};
  let ok = true;
  try { out.spend = await syncAdsSpend(7); } catch (e) { ok = false; out.spendError = msg(e); }
  try { out.conversions = await uploadOrderConversions(); } catch (e) { ok = false; out.conversionsError = msg(e); }
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 500 });
}
