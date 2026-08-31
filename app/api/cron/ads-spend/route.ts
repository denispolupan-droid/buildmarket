import { NextRequest, NextResponse } from 'next/server';
import { syncAdsSpend } from '../../../../lib/google-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Щоденний синк витрат Google Ads → ads_spend (Фінанси → «Реклама», ROMI).
 * Тягнемо 7 днів назад: Ads дозаписує конверсії та коригування заднім числом,
 * upsert по (date, campaign_id) робить це безпечним. Розклад — vercel.json.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncAdsSpend(7);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
