import { NextRequest, NextResponse } from 'next/server';
import { rzSearchCities } from '../../../../lib/rz-delivery-api';

// Підказки міст для чекауту. Токен тут не потрібен взагалі: довідники
// rz-delivery віддає анонімно (перевірено), тож проксі існує тільки заради
// однакового домену (без CORS) і однієї точки, де можна щось підкрутити.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  try {
    const cities = await rzSearchCities(q);
    return NextResponse.json({ cities });
  } catch (err) {
    console.error('[rz-delivery/cities]', err);
    return NextResponse.json({ cities: [], error: 'Довідник міст недоступний' }, { status: 502 });
  }
}
