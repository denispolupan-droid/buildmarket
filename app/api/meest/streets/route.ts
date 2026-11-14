import { NextRequest, NextResponse } from 'next/server';
import { meestSearchStreets } from '../../../../lib/meest-ship';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Вулиці міста для кур'єрської доставки Meest у кошику (14.11.2026). Проксі на
// токен договору з кешем CDN — довідник вулиць змінюється рідко.
async function _GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get('city') ?? '').trim();
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (!/^[0-9a-f-]{36}$/i.test(city) || q.length < 2) return NextResponse.json({ streets: [] });
  try {
    const streets = await meestSearchStreets(city, q);
    return NextResponse.json({ streets }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (err) {
    log.warn('meest.streets_failed', { city, q, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ streets: [], error: 'Довідник вулиць Meest недоступний' }, { status: 502 });
  }
}

export const GET = withApi('meest/streets', _GET);
