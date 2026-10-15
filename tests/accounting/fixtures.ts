import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Фікстури для інтеграційних тестів: реальні склад / постачальник / SKU / клієнт
 * із тестової бази — з повтором при транзиторній відмові.
 *
 * Навіщо повтор. Тестовий проєкт Supabase час від часу відповідає
 * «JWT issued at future» — і рівно на ОДИН запит із чотирьох паралельних, щоразу
 * на інший (то warehouses, то suppliers). Поганий ключ так поводитись не може:
 * він валив би всі чотири однаково. Це розсинхрон годинника на їхньому боці, і
 * через нього нічний CI був червоний чотири прогони поспіль при зеленому коді.
 *
 * Повторюємо ВЕСЬ набір, а не окремий запит: він дешевий (чотири limit(1)), і
 * так не треба розбирати, який саме з них не пощастив.
 */
export type Fixtures = {
  warehouseId: number;
  supplierId:  number;
  sku:         string;
  customerId:  string | null;
};

const ATTEMPTS = 3;
const DELAY_MS = 1500;

export async function loadFixtures(db: SupabaseClient): Promise<Fixtures> {
  let lastError = '';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const [whRes, supRes, prodRes, custRes] = await Promise.all([
      db.from('warehouses').select('id').order('id').limit(1),
      db.from('suppliers').select('id').order('id').limit(1),
      db.from('products').select('sku').order('sort_order').limit(1),
      db.from('customers').select('id').order('created_at').limit(1),
    ]);

    const wh   = whRes.data?.[0];
    const sup  = supRes.data?.[0];
    const prod = prodRes.data?.[0];

    if (wh && sup && prod) {
      return {
        warehouseId: wh.id as number,
        supplierId:  sup.id as number,
        sku:         prod.sku as string,
        customerId:  (custRes.data?.[0]?.id as string) ?? null,
      };
    }

    lastError = [
      !wh   ? `warehouses: ${whRes.error?.message ?? 'порожньо'}`   : '',
      !sup  ? `suppliers: ${supRes.error?.message ?? 'порожньо'}`   : '',
      !prod ? `products: ${prodRes.error?.message ?? 'порожньо'}`   : '',
    ].filter(Boolean).join('; ');

    if (attempt < ATTEMPTS) {
      console.warn(`[fixtures] спроба ${attempt}/${ATTEMPTS} не вдалась (${lastError}) — повтор через ${DELAY_MS} мс`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  throw new Error(`Фікстури не завантажились за ${ATTEMPTS} спроби — ${lastError}`);
}

// ── Справжні замовлення для тестів ───────────────────────────────────────────
// З міграції 129 (15.10.2026) acc_documents / money_entries / stock_reservations
// тримають FK на orders(id): документ чи резерв із вигаданим randomUUID() замість
// замовлення база відхиляє — як і має бути в проді. Тести створюють мінімальне
// замовлення тут і прибирають його в afterAll ПІСЛЯ reset_accounting_test_data
// (FK RESTRICT не дасть видалити замовлення, поки на ньому є документи).

const createdOrders: string[] = [];

export async function createTestOrder(db: SupabaseClient, sku = 'TEST', qty = 1, price = 100): Promise<string> {
  const { data, error } = await db.from('orders').insert({
    contact: '[TEST] accounting', phone: '+380000000000', email: 'test@fixline.test',
    status: 'new', total_price: qty * price, channel_code: 'website', delivery_type: 'nova', payment_type: 'cod',
    items: [{ sku, name: 'test', brand: 'test', qty, price }],
  }).select('id').single();
  if (error) throw new Error('createTestOrder: ' + error.message);
  createdOrders.push(data.id as string);
  return data.id as string;
}

export async function deleteTestOrders(db: SupabaseClient): Promise<void> {
  if (!createdOrders.length) return;
  const { error } = await db.from('orders').delete().in('id', createdOrders.splice(0));
  if (error) console.error('deleteTestOrders:', error.message);
}
