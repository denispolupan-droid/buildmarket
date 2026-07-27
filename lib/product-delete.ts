import { createClient } from '@supabase/supabase-js';

/**
 * Видалення товарів із захистом облікової історії.
 *
 * На products.sku посилається 20 таблиць. Частина — CASCADE (супутні дані товару),
 * але вісім мають NO ACTION і просто ловлять FK-помилку («violates foreign key
 * constraint price_history_sku_fkey»). Гасити їх усі підряд не можна: рядки в
 * acc_document_lines і stock_movements — це проведені документи й рух по складу,
 * тобто первинка обліку. Товар, який уже купували/продавали, не видаляється —
 * його деактивують.
 *
 * Тому: спершу рахуємо, які SKU «захищені», решту чистимо разом із супутніми
 * таблицями. Повертаємо обидва списки, щоб UI сказав людині, що саме не пішло.
 */

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CHUNK = 100;

function chunked<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

export type DeleteBlock = { sku: string; reason: string };
export type DeleteResult = { deleted: string[]; blocked: DeleteBlock[] };

export async function deleteProducts(skus: string[]): Promise<DeleteResult> {
  const blocked = new Map<string, string>();
  const block = (rows: { sku: string }[] | null, reason: string) => {
    for (const row of rows ?? []) if (!blocked.has(row.sku)) blocked.set(row.sku, reason);
  };

  for (const part of chunked(skus)) {
    // Первинка обліку: рядки проведених документів і рух по складу
    const [{ data: docLines }, { data: movements }] = await Promise.all([
      db.from('acc_document_lines').select('sku').in('sku', part),
      db.from('stock_movements').select('sku').in('sku', part),
    ]);
    block(docLines, 'проходить у документах обліку');
    block(movements, 'має рух по складу');

    // Активний резерв = товар у відкритому замовленні
    const { data: reserved } = await db
      .from('stock_reservations').select('sku').in('sku', part).is('released_at', null);
    block(reserved, 'зарезервований у відкритому замовленні');

    // Ненульовий залишок на складі
    const { data: balances } = await db
      .from('stock_balance').select('sku').in('sku', part).neq('qty_total', 0);
    block(balances, 'є залишок на складі');
  }

  const deletable = skus.filter(s => !blocked.has(s));
  const deleted: string[] = [];

  for (const part of chunked(deletable)) {
    await purgeSatellites(part);
    const { error } = await db.from('products').delete().in('sku', part);
    if (!error) { deleted.push(...part); continue; }

    // Несподіваний FK — не валимо всю операцію, а ізолюємо винуватця по одному,
    // щоб решта пачки видалилась, а людина побачила конкретний SKU і причину.
    for (const sku of part) {
      const { error: one } = await db.from('products').delete().eq('sku', sku);
      if (one) blocked.set(sku, fkReason(one.message));
      else deleted.push(sku);
    }
  }

  return { deleted, blocked: [...blocked].map(([sku, reason]) => ({ sku, reason })) };
}

/** Супутні дані товару — чистимо явно, щоб порядок видалення був детермінованим. */
async function purgeSatellites(part: string[]): Promise<void> {
  await Promise.allSettled([
    db.from('price_history').delete().in('sku', part),
    db.from('market_price_checks').delete().in('sku', part),
    db.from('marketplace_listings').delete().in('sku', part),
    db.from('customer_price_rules').delete().in('sku', part),
    db.from('fulfillment_rules').delete().in('sku', part),
    db.from('stock_balance').delete().in('sku', part),
    db.from('stock_reservations').delete().in('sku', part),
    db.from('stock_batches').delete().in('sku', part),
    db.from('uom_conversions').delete().in('sku', part),
    db.from('product_characteristics').delete().in('product_sku', part),
    db.from('product_faq').delete().in('product_sku', part),
    db.from('product_reviews').delete().in('product_sku', part),
    db.from('product_prices').delete().in('sku', part),
    db.from('product_stock').delete().in('sku', part),
    db.from('supplier_stock').delete().in('sku', part),
    db.from('supplier_sku_map').delete().in('our_sku', part),
    db.from('supplier_product_overrides').delete().in('our_sku', part),
    db.from('supplier_promotions').delete().in('our_sku', part),
  ]);
}

/** «…violates foreign key constraint "x_sku_fkey" on table "y"» → людська причина */
function fkReason(message: string): string {
  const table = /on table "([^"]+)"/.exec(message)?.[1];
  return table ? `пов'язаний із записами в «${table}»` : message;
}
