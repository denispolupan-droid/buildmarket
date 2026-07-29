import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { getPromDeliveryTariff, PROM_DELIVERY_TARIFF_KEY, type PromDeliveryBracket } from '../../../../../lib/prom-delivery';

// Тариф «дешевої доставки» Prom (адмінка → Prom → Комісії → «Дешева доставка»).
// Діє з моменту збереження: застосовується до НОВИХ доставок; вже проведені
// списання не перераховуються (проводка робиться при доставці за чинним тарифом).

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ brackets: await getPromDeliveryTariff() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as { brackets?: unknown } | null;
  const list = Array.isArray(body?.brackets) ? body!.brackets : null;
  if (!list || list.length === 0) {
    return NextResponse.json({ error: 'brackets required' }, { status: 400 });
  }

  const brackets: PromDeliveryBracket[] = [];
  for (const item of list) {
    const o = item as { from?: unknown; fee?: unknown };
    const from = Number(o.from);
    const fee = Number(o.fee);
    if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: 'Невалідний рядок тарифу: поріг > 0, збір ≥ 0' }, { status: 400 });
    }
    brackets.push({ from, fee });
  }
  for (let i = 1; i < brackets.length; i++) {
    if (brackets[i].from <= brackets[i - 1].from) {
      return NextResponse.json({ error: 'Пороги мають зростати' }, { status: 400 });
    }
  }

  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert(
    { key: PROM_DELIVERY_TARIFF_KEY, value: JSON.stringify({ brackets, updated_at: new Date().toISOString() }) },
    { onConflict: 'key' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, brackets });
}
