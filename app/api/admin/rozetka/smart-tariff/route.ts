import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { getSmartTariff, SMART_TARIFF_KEY, type SmartBracket } from '../../../../../lib/rozetka-smart';

// Тариф компенсації Rozetka Smart (адмінка → Товари Rozetka → «Умови Smart»).
// Діє з моменту збереження: застосовується до НОВИХ відгрузок; вже проведені
// списання не перераховуються (проводка робиться в момент відгрузки за чинним тарифом).

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ brackets: await getSmartTariff() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as { brackets?: unknown } | null;
  const list = Array.isArray(body?.brackets) ? body!.brackets : null;
  if (!list || list.length === 0) {
    return NextResponse.json({ error: 'brackets required' }, { status: 400 });
  }

  const brackets: SmartBracket[] = [];
  for (const item of list) {
    const o = item as { upTo?: unknown; fee?: unknown };
    const upTo = o.upTo === null || o.upTo === '' || o.upTo === undefined ? null : Number(o.upTo);
    const fee = Number(o.fee);
    if ((upTo !== null && (!Number.isFinite(upTo) || upTo <= 0)) || !Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: 'Невалідний кошик тарифу: поріг > 0, збір ≥ 0' }, { status: 400 });
    }
    brackets.push({ upTo, fee });
  }
  if (brackets[brackets.length - 1].upTo !== null) {
    return NextResponse.json({ error: 'Останній кошик мусить бути «і вище» (без верхньої межі)' }, { status: 400 });
  }
  for (let i = 1; i < brackets.length; i++) {
    const prev = brackets[i - 1].upTo, cur = brackets[i].upTo;
    if (prev === null || (cur !== null && cur <= prev)) {
      return NextResponse.json({ error: 'Пороги мають зростати' }, { status: 400 });
    }
  }

  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert(
    { key: SMART_TARIFF_KEY, value: JSON.stringify({ brackets, updated_at: new Date().toISOString() }) },
    { onConflict: 'key' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, brackets });
}
