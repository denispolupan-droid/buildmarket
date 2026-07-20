import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Item = { sku: string; name: string; brand: string; qty: number; selling_price: number };

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { items, recipient, comment, has_cod, cod_amount } = await req.json();

  if (!items?.length)            return NextResponse.json({ error: 'Немає товарів' }, { status: 400 });
  if (!recipient?.city_ref)      return NextResponse.json({ error: 'Оберіть місто' }, { status: 400 });
  if (!recipient?.warehouse_ref) return NextResponse.json({ error: 'Оберіть відділення' }, { status: 400 });
  if (!recipient?.last_name)     return NextResponse.json({ error: 'Введіть прізвище' }, { status: 400 });
  if (!recipient?.phone)         return NextResponse.json({ error: 'Введіть телефон' }, { status: 400 });

  const skus: string[] = (items as Item[]).map(i => i.sku);
  if (skus.some(s => !s || typeof s !== 'string')) {
    return NextResponse.json({ error: 'Некоректні SKU' }, { status: 400 });
  }

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name, email')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено. Зверніться до адміністратора.' }, { status: 404 });

  // ── Беремо drop-ціни з БД (НЕ від клієнта) ──────────────────────────────────
  const { data: prices, error: priceErr } = await serviceClient
    .from('product_stock')
    .select('sku, price_drop')
    .in('sku', skus);

  if (priceErr || !prices) {
    return NextResponse.json({ error: 'Не вдалось завантажити ціни' }, { status: 500 });
  }

  const priceMap = new Map(prices.map(p => [p.sku, Number(p.price_drop ?? 0)]));

  // Перевіряємо що всі SKU існують і мають ціну
  for (const sku of skus) {
    if (!priceMap.has(sku)) {
      return NextResponse.json({ error: `Товар ${sku} не знайдений` }, { status: 400 });
    }
    if ((priceMap.get(sku) ?? 0) <= 0) {
      return NextResponse.json({ error: `Для товару ${sku} не встановлена дропшип-ціна` }, { status: 400 });
    }
  }

  const useCod    = has_cod !== false;
  const itemsWithCost = (items as Item[]).map(i => ({
    ...i,
    cost_price: priceMap.get(i.sku) ?? 0,
  }));
  const totalCost = itemsWithCost.reduce((s, i) => s + i.cost_price * i.qty, 0);
  const totalSell = parseFloat(cod_amount) || totalCost;

  // ── Списуємо закупочну вартість з балансу ───────────────────────────────────
  if (totalCost > 0) {
    const itemsList = itemsWithCost.map(i => `${i.brand} ${i.name} × ${i.qty}`).join(', ');
    const { data: chargeResult, error: chargeErr } = await serviceClient.rpc('charge_partner_balance', {
      p_customer_id: customer.id,
      p_amount:      totalCost,
      p_description: `Замовлення: ${itemsList}`,
    });

    if (chargeErr || !chargeResult?.success) {
      return NextResponse.json(
        { error: chargeResult?.error ?? chargeErr?.message ?? 'Недостатньо балансу' },
        { status: 400 },
      );
    }
  }

  // ── Зберігаємо замовлення ────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await serviceClient
    .from('orders')
    .insert({
      status:           'new',
      channel_code:     'dropship',
      price_type:       'drop',
      partner_code:     customer.id,
      contact:          `${recipient.last_name} ${recipient.first_name} ${recipient.mid_name ?? ''}`.trim(),
      phone:            recipient.phone,
      email:            customer.email ?? user.email ?? '',
      company:          customer.name ?? '',
      delivery_type:    'nova',
      delivery_subtype: 'warehouse',
      delivery_address: `${recipient.city_name}, ${recipient.warehouse_name}`,
      delivery_city_ref:      recipient.city_ref,
      delivery_city_name:     recipient.city_name,
      delivery_warehouse_ref: recipient.warehouse_ref,
      payment_type:    useCod ? 'cod' : 'prepaid',
      comment:         comment || null,
      items: itemsWithCost.map(i => ({
        sku: i.sku, name: `${i.brand} ${i.name}`, brand: i.brand,
        qty: i.qty, price: i.selling_price, cost_price: i.cost_price,
      })),
      total_price: totalSell,
    })
    .select('id, order_number')
    .single();

  // ── Якщо запис в БД не вдався — повертаємо списані кошти ───────────────────
  if (orderErr || !order) {
    if (totalCost > 0) {
      await serviceClient.rpc('refund_partner_balance', {
        p_customer_id: customer.id,
        p_amount:      totalCost,
        p_description: 'Повернення: помилка збереження замовлення',
      });
    }
    return NextResponse.json({ error: `Помилка збереження: ${orderErr?.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order_number: order.order_number });
}
