import { NextRequest, NextResponse } from 'next/server';
import { meestSearchCities } from '../../../../lib/meest-ship';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Підказки міст Meest для чекауту (13.11.2026). Проксі на наш токен договору;
// відповідь кешується на CDN (довідник міст змінюється рідко), щоб набір у полі
// не бив по API Meest на кожну літеру кожного покупця.
async function _GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ cities: [] });
  try {
    const cities = (await meestSearchCities(q)).filter(c => c.hasBranches).slice(0, 20)
      .map(c => ({ id: c.cityID, name: c.name, region_name: c.region, district_name: c.district || null }));
    return NextResponse.json({ cities }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (err) {
    log.warn('meest.cities_failed', { q, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ cities: [], error: 'Довідник міст Meest недоступний' }, { status: 502 });
  }
}

export const GET = withApi('meest/cities', _GET);
