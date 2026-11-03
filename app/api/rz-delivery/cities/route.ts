import { NextRequest, NextResponse } from 'next/server';
import { rzSearchCities } from '../../../../lib/rz-delivery-api';
import { withApi } from '../../../../lib/api-handler';

// Підказки міст для чекауту. Токен тут не потрібен взагалі: довідники
// rz-delivery віддає анонімно (перевірено), тож проксі існує тільки заради
// однакового домену (без CORS) і однієї точки, де можна щось підкрутити.

async function _GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  try {
    const cities = await rzSearchCities(q);
    return NextResponse.json({ cities });
  } catch (err) {
    console.error('[rz-delivery/cities]', err);
    return NextResponse.json({ cities: [], error: 'Довідник міст недоступний' }, { status: 502 });
  }
}

export const GET = withApi('rz-delivery/cities', _GET);
