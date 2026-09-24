import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { findRozetkaSendCities, findRozetkaSenderPickups } from '../../../../../lib/rozetka-delivery-ttn';

// Довідник для вибору відділення відправника в модалці МП-накладної Rozetka.
//   ?q=Харків              — міста, звідки доступне відправлення;
//   ?city=<uuid>&name=…    — точки цього міста, куди можна здати посилку.
// Ходить у Seller API продавця, тому лише для адміна — публічного проксі не буде.

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  try {
    const city = sp.get('city');
    if (city) {
      const pickups = await findRozetkaSenderPickups({ id: city, name: sp.get('name') ?? '' });
      return NextResponse.json({ pickups });
    }
    const q = sp.get('q') ?? '';
    return NextResponse.json({ cities: await findRozetkaSendCities(q) });
  } catch (err) {
    console.error('[rozetka sender-directory]', err);
    return NextResponse.json({ error: 'Довідник Rozetka недоступний' }, { status: 502 });
  }
}
