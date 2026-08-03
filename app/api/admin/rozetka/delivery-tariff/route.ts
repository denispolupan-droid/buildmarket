import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import {
  getRozetkaDeliveryTariff,
  ROZETKA_DELIVERY_TARIFF_KEY,
  type RozetkaDeliveryTariff,
} from '../../../../../lib/rozetka-delivery-fee';

// Тариф доставки в точки видачі Rozetka (адмінка → Товари Rozetka → «Умови Smart»).
// Дзеркало smart-tariff: діє з моменту збереження і застосовується до НОВИХ відгрузок.
// Уже проведені списання не перераховуються — проводка робиться в момент відгрузки.
//
// Нагадування про пріоритет (див. resolveRozetkaDeliveryFee): цей тариф — запасний
// варіант. Якщо в накладній є фактична сума, беремо її; для Smart-замовлень збір
// не нараховується взагалі, бо Rozetka бере компенсацію Smart ЗАМІСТЬ нього.

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getRozetkaDeliveryTariff());
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Partial<Record<keyof RozetkaDeliveryTariff, unknown>> | null;
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const perParcel = num(body.perParcel);
  const perParcelFromMeest = num(body.perParcelFromMeest);

  for (const n of [perParcel, perParcelFromMeest]) {
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Ставки мають бути числом ≥ 0' }, { status: 400 });
    }
  }

  const tariff: RozetkaDeliveryTariff = { perParcel, perParcelFromMeest };

  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert(
    { key: ROZETKA_DELIVERY_TARIFF_KEY, value: JSON.stringify({ ...tariff, updated_at: new Date().toISOString() }) },
    { onConflict: 'key' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...tariff });
}
