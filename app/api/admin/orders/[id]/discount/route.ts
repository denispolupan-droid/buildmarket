import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { applyOrderDiscount, type DiscountItem } from '../../../../../../lib/pricing';
import { setOrderLines, type OrderLineInput } from '../../../../../../lib/orders/lines';
import { loadOrderItems } from '../../../../../../lib/orders/lines-read';
import { parseBody, zMoney, zYmd, zText, z } from '../../../../../../lib/validate';
import { withApi } from '../../../../../../lib/api-handler';

// Ручна знижка по замовленню (Варіант A): знижку «зашиваємо» в построчну ціну
// items[].price. Оскільки вся облікова гілка (РН, виручка, дебіторка, рахунок)
// читає саме items[].price / total_price — нижчі ціни автоматично консистентні,
// без жодних змін у ядрі обліку.
//
// База для знижки — снапшот price_base у самій позиції (не product_stock), тому
// працює і для ручних позицій, ідемпотентно (повтор рахує від бази, не компаундить)
// і оборотно (pct=0 повертає повну ціну).
//
// Дозволено лише ДО відгрузки (після — ціни зафіксовані в проведеній РН). Для
// маркетплейсів (Prom/Rozetka) знижку дозволено; у дропшипі — ні (баланс партнера
// вже списаний за собівартістю).

const DISCOUNTABLE_STATUSES = ['new', 'confirmed', 'awaiting_stock', 'picking'];
const LOCKED_CHANNELS = ['dropship'];

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = await parseBody(req, z.object({
    pct:    z.coerce.number().min(0, 'від 0').max(100, 'не більше 100').optional(),
    amount: z.coerce.number().min(0, 'не менше 0').max(10_000_000).optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, status, channel_code')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  if (!DISCOUNTABLE_STATUSES.includes(order.status as string)) {
    return NextResponse.json({ error: 'Знижку можна змінювати лише до відгрузки' }, { status: 409 });
  }
  if (LOCKED_CHANNELS.includes(order.channel_code ?? '')) {
    return NextResponse.json({ error: 'Знижка недоступна для цього каналу' }, { status: 409 });
  }

  // Поточні позиції — з order_lines (джерело правди), не з jsonb-кешу items
  const items = (await loadOrderItems(db, id)) as unknown as DiscountItem[];
  const result = applyOrderDiscount(items, { pct: body.pct, amount: body.amount });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Позиції — лише через lib/orders/lines (етап C): рядки, похідний items і
  // total_price (тригером) однією транзакцією разом із полями знижки
  let total: number;
  try {
    total = await setOrderLines(db, id, result.items as unknown as OrderLineInput[], { discount_pct: result.discountPct, discount_amount: result.discountAmount });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    discount_pct: result.discountPct,
    discount_amount: result.discountAmount,
    total_price: total,
    items: result.items,
  });
}

export const POST = withApi('admin/orders/[id]/discount', _POST);
