import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';

// Зміна типу цін замовлення (роздріб / опт / дроп) з перерахунком позицій
// за відповідним прайсом із product_stock. Дозволено лише ДО відгрузки
// (після — ціни зафіксовані в проведеній РН). Тип цін дозволено міняти для всіх
// каналів, включно з маркетплейсами (напр., щоб виставити рахунок опт/дроп на
// підприємство за замовленням з Rozetka/Prom).

const PRICEABLE_STATUSES = ['new', 'confirmed', 'awaiting_stock', 'picking'];
const LOCKED_CHANNELS: string[] = [];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { price_type?: string };
  const priceType = body.price_type;
  if (!['retail', 'wholesale', 'drop'].includes(priceType ?? '')) {
    return NextResponse.json({ error: 'Невірний тип цін' }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, order_number, status, channel_code, items, price_type, promo_discount, discount_pct')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  if (!PRICEABLE_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Тип цін можна змінювати лише до відгрузки' }, { status: 409 });
  }
  if (LOCKED_CHANNELS.includes(order.channel_code ?? '')) {
    return NextResponse.json({ error: 'Ціни маркетплейс-замовлення зафіксовані маркетплейсом' }, { status: 409 });
  }
  if (order.price_type === priceType) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Ручна знижка (Варіант A) — множник поверх базової ціни тарифу.
  const discountPct = Math.max(0, Math.min(100, Number(order.discount_pct ?? 0)));
  const discountFactor = 1 - discountPct / 100;

  type Item = { sku: string; qty: number; price: number; price_base?: number; is_bonus?: boolean; [k: string]: unknown };
  const items = (order.items ?? []) as Item[];
  const skus = items.map(i => i.sku);

  const { data: rows, error: priceErr } = await db
    .from('product_stock')
    .select('sku, price_promo, price_retail, price_unit, price_drop')
    .in('sku', skus);
  if (priceErr) return NextResponse.json({ error: priceErr.message }, { status: 500 });
  const bySku = new Map((rows ?? []).map(r => [r.sku, r]));

  const newItems: Item[] = [];
  for (const item of items) {
    if (item.is_bonus) { newItems.push(item); continue; }  // бонусні рядки не переоцінюємо
    const row = bySku.get(item.sku);
    if (!row) return NextResponse.json({ error: `${item.sku}: немає в прайсі` }, { status: 409 });

    const retail = Number(row.price_retail ?? 0);
    const promo  = row.price_promo != null ? Number(row.price_promo) : null;
    let unit: number;
    if (priceType === 'retail') {
      unit = Number(promo ?? retail);
    } else if (priceType === 'wholesale') {
      // Та сама промо-логіка, що в чекауті: % акції застосовується до оптової ціни
      const base = Number(row.price_unit ?? 0);
      unit = promo != null && retail > 0 && promo < retail
        ? Math.round(base * (promo / retail) * 100) / 100
        : base;
    } else {
      unit = Number(row.price_drop ?? 0);
    }
    if (!(unit > 0)) {
      return NextResponse.json({ error: `${item.sku}: не встановлена ціна для тарифу «${priceType}»` }, { status: 409 });
    }
    // Зберігаємо базову ціну тарифу як price_base і переприкладаємо ручну знижку
    // (якщо була), щоб зміна типу цін не «з'їдала» знижку. discount у зашитій моделі
    // — множник поверх базової ціни.
    newItems.push({ ...item, price_base: unit, price: Math.round(unit * discountFactor * 100) / 100 });
  }

  const baseTotal = Math.round(newItems.reduce((s, i) => s + (i.is_bonus ? 0 : Number(i.price_base ?? i.price) * Number(i.qty)), 0) * 100) / 100;
  const newTotal  = Math.round(newItems.reduce((s, i) => s + (i.is_bonus ? 0 : Number(i.price) * Number(i.qty)), 0) * 100) / 100;
  const discountAmount = Math.round((baseTotal - newTotal) * 100) / 100;

  const { error: updErr } = await db
    .from('orders')
    .update({ items: newItems, total_price: newTotal, price_type: priceType, discount_amount: discountAmount })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, price_type: priceType, total_price: newTotal, discount_amount: discountAmount, items: newItems });
}
