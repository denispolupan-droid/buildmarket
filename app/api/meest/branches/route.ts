import { NextRequest, NextResponse } from 'next/server';
import { meestBranches } from '../../../../lib/meest-ship';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Відділення й поштомати Meest у місті для чекауту (13.11.2026). Як і для
// ROZETKA Доставки, фільтруємо за вагою замовлення: пункт, що посилку не прийме
// (Міні-відділення — до 10 кг), показувати не можна. Кеш CDN — 6 год.
async function _GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get('city') ?? '').trim();
  const weight = Number(req.nextUrl.searchParams.get('weight') ?? 0) || 0;
  if (!/^[0-9a-f-]{36}$/i.test(city)) return NextResponse.json({ departments: [], total: 0 });
  try {
    const all = await meestBranches(city);
    const fits = all.filter(b => !b.limits?.weightPlaceMax || weight <= b.limits.weightPlaceMax);
    const departments = fits.map(b => ({
      id: b.branchID,
      label: b.title,
      schedule: [] as string[],
      limitKg: b.limits?.weightPlaceMax ?? null,
      postomat: b.postomat,
    }));
    return NextResponse.json({ departments, total: all.length }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } });
  } catch (err) {
    log.warn('meest.branches_failed', { city, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ departments: [], total: 0, error: 'Довідник відділень Meest недоступний' }, { status: 502 });
  }
}

export const GET = withApi('meest/branches', _GET);
