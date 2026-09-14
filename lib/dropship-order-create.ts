/**
 * Створення дропшип-замовлення (серверна частина) — один шлях для форми кабінету
 * й Excel-імпорту. ТТН тут НЕ створюється: замовлення йде звичайним потоком
 * адмінки (підтвердження → ТТН → відвантаження → доставка), і лише так крон доставки
 * бачить посилку, проводить продаж і нараховує партнеру накладений платіж.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDropshipLines, type DropshipCatalogItem, type DropshipLineInput, type DropshipLine } from './dropship-order';

export type DropshipCustomer = { id: string; name: string | null; email: string | null };

export type DropshipRecipient = {
  last_name:      string;
  first_name:     string;
  mid_name:       string;
  phone:          string;
  city_ref:       string;
  city_name:      string;
  warehouse_ref:  string;
  warehouse_name: string;
};

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Нормалізує й перевіряє отримувача. Повертає текст помилки або готовий об'єкт. */
export function parseDropshipRecipient(raw: unknown): DropshipRecipient | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rec: DropshipRecipient = {
    last_name:      str(r.last_name, 80),
    first_name:     str(r.first_name, 80),
    mid_name:       str(r.mid_name, 80),
    phone:          str(r.phone, 40),
    city_ref:       str(r.city_ref, 64),
    city_name:      str(r.city_name),
    warehouse_ref:  str(r.warehouse_ref, 64),
    warehouse_name: str(r.warehouse_name, 300),
  };
  if (!rec.last_name || !rec.first_name) return "Введіть прізвище та ім'я отримувача";
  if (rec.phone.replace(/\D/g, '').length < 10) return 'Введіть телефон отримувача';
  if (!rec.city_ref)      return 'Оберіть місто доставки';
  if (!rec.warehouse_ref) return 'Оберіть відділення Нової Пошти';
  return rec;
}

export async function getDropshipCustomer(db: SupabaseClient, authUserId: string): Promise<DropshipCustomer | null> {
  const { data } = await db
    .from('customers')
    .select('id, name, email')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return data ?? null;
}

/** Каталог під конкретні SKU: назва/бренд + дроп-ціна й наявність. */
export async function loadDropshipCatalog(db: SupabaseClient, skus: string[]): Promise<Map<string, DropshipCatalogItem>> {
  const uniq = [...new Set(skus.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()))];
  if (!uniq.length) return new Map();
  const [{ data: products, error: pErr }, { data: stock, error: sErr }] = await Promise.all([
    db.from('products').select('sku, name, brand, volume, is_active').in('sku', uniq).limit(uniq.length),
    db.from('product_stock').select('sku, price_drop, stock_status').in('sku', uniq).limit(uniq.length),
  ]);
  if (pErr || sErr) throw new Error('Не вдалось завантажити каталог');
  const stockMap = new Map((stock ?? []).map(s => [s.sku as string, s]));
  return new Map((products ?? []).map(p => {
    const s = stockMap.get(p.sku as string);
    return [p.sku as string, {
      sku: p.sku, name: p.name, brand: p.brand, volume: p.volume ?? null,
      is_active: !!p.is_active,
      stock_status: (s?.stock_status as string | undefined) ?? null,
      price_drop: s?.price_drop != null ? Number(s.price_drop) : null,
    }];
  }));
}

export type CreateDropshipOrderResult =
  | { ok: true; order_id: string; order_number: number; total_cost: number; total_sell: number }
  | { ok: false; error: string; status: number };

export async function createDropshipOrder(db: SupabaseClient, params: {
  customer:     DropshipCustomer;
  fallbackEmail: string | null;
  items:        DropshipLineInput[];
  recipient:    unknown;
  hasCod:       boolean;
  comment?:     string | null;
  source:       'form' | 'excel';
}): Promise<CreateDropshipOrderResult> {
  const recipient = parseDropshipRecipient(params.recipient);
  if (typeof recipient === 'string') return { ok: false, error: recipient, status: 400 };

  let catalog: Map<string, DropshipCatalogItem>;
  try {
    catalog = await loadDropshipCatalog(db, params.items.map(i => String(i?.sku ?? '')));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Помилка каталогу', status: 500 };
  }

  const built = buildDropshipLines(params.items, catalog);
  if (!built.ok) return { ok: false, error: built.error, status: 400 };
  const { lines, totalCost, totalSell } = built;

  // id генеруємо заздалегідь: списання одразу пишеться з order_id, і кожну гривню
  // з балансу видно по замовленню (раніше charge ішов без order_id).
  const orderId = crypto.randomUUID();
  const summary = lines.map((l: DropshipLine) => `${l.name} × ${l.qty}`).join(', ');

  const { data: charge, error: chargeErr } = await db.rpc('charge_partner_balance', {
    p_customer_id: params.customer.id,
    p_amount:      totalCost,
    p_order_id:    orderId,
    p_description: `Замовлення: ${summary}`.slice(0, 500),
  });
  if (chargeErr || !charge?.success) {
    return { ok: false, error: charge?.error ?? chargeErr?.message ?? 'Недостатньо балансу', status: 400 };
  }

  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      id:               orderId,
      status:           'new',
      channel_code:     'dropship',
      price_type:       'drop',
      partner_code:     params.customer.id,
      contact:          `${recipient.last_name} ${recipient.first_name} ${recipient.mid_name}`.trim(),
      phone:            recipient.phone,
      email:            params.customer.email ?? params.fallbackEmail ?? '',
      company:          params.customer.name ?? '',
      delivery_type:    'nova',
      delivery_subtype: 'warehouse',
      delivery_address: `${recipient.city_name}, ${recipient.warehouse_name}`,
      delivery_city_ref:      recipient.city_ref,
      delivery_city_name:     recipient.city_name,
      delivery_warehouse_ref: recipient.warehouse_ref,
      payment_type:     params.hasCod ? 'cod' : 'prepaid',
      comment:          str(params.comment, 1000) || (params.source === 'excel' ? 'Імпорт з Excel' : null),
      items:            lines,
      // Сума, яку платить кінцевий клієнт (= накладений платіж), рахується тут
      // з рядків, а не береться з тіла запиту.
      total_price:      totalSell,
    })
    .select('id, order_number')
    .single();

  if (orderErr || !order) {
    await db.rpc('refund_partner_balance', {
      p_customer_id: params.customer.id,
      p_amount:      totalCost,
      p_order_id:    orderId,
      p_description: 'Повернення: помилка збереження замовлення',
    });
    return { ok: false, error: `Помилка збереження: ${orderErr?.message ?? 'невідома'}`, status: 500 };
  }

  return { ok: true, order_id: order.id, order_number: order.order_number, total_cost: totalCost, total_sell: totalSell };
}
