import { NextRequest, NextResponse } from 'next/server';
import { crawlDemand } from '../../../../lib/seo/demand-crawl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * Щотижневий обхід автопідказок Google по всіх категоріях (uk+ru) —
 * наповнює search_demand для вкладки «Попит» → «Невидимий попит».
 * ~75 категорій × 2 мови × 11 модифікаторів ≈ 1 650 запитів із паузою
 * 120 мс — 5–6 хвилин; перший обхід зайняв 343 с, тому maxDuration 800 (Fluid). Розклад — vercel.json.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await crawlDemand();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
