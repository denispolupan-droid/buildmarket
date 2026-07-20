import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { applyOrderDiscount, type DiscountItem } from '../../../../../../lib/pricing';

// Ручна знижка по замовленню (Варіант A): знижку «зашиваємо» в построчну ціну
// items[].price. Оскільки вся облікова гілка (РН, виручка, дебіторка, рахунок)
// читає саме items[].price / total_price — нижчі ціни автоматично консистентні,
// без жодних змін у ядрі обліку.
//
// База для знижки — снапшот price_base у самій позиції (не product_stock), тому
// працює і для ручних позицій, ідемпотентно (повтор рахує від бази, не компаундить)
// і оборотно (pct=0 повертає повну ціну).
//
// Дозволено лише ДО відгрузки (після — ціни зафіксовані в проведеній РН) і лише
// для власних каналів (у маркетплейс ціна зафіксована площадкою, у дропшипі
// баланс партнера вже списаний за собівартістю).

const DISCOUNTABLE_STATUSES = ['new', 'confirmed', 'awaiting_stock', 'picking'];
const LOCKED_CHANNELS = ['prom', 'rozetka', 'dropship'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { pct?: number; amount?: number };

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, status, channel_code, items')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  if (!DISCOUNTABLE_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Знижку можна змінювати лише до відгрузки' }, { status: 409 });
  }
  if (LOCKED_CHANNELS.includes(order.channel_code ?? '')) {
    return NextResponse.json({ error: 'Знижка недоступна для цього каналу' }, { status: 409 });
  }

  const items = (order.items ?? []) as DiscountItem[];
  const result = applyOrderDiscount(items, { pct: body.pct, amount: body.amount });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { error: updErr } = await db
    .from('orders')
    .update({ items: result.items, total_price: result.total, discount_pct: result.discountPct, discount_amount: result.discountAmount })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    discount_pct: result.discountPct,
    discount_amount: result.discountAmount,
    total_price: result.total,
    items: result.items,
  });
}
