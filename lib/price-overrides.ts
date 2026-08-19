/**
 * Наценка (або фіксована ціна) на конкретний товар — supplier_product_overrides.
 *
 * Навіщо: ціни продажу народжуються в синку постачальника з наценки
 * (товар > бренд > постачальник). Якщо переоцінка запише лише готову ціну в
 * product_stock, найближчий синк перерахує її від прайса й перезапише — саме
 * так переоцінка 773 товарів від 18.08 прожила 55 хвилин. Тому переоцінка
 * зберігає наценку, а ціну ставить одразу тільки щоб вітрина не чекала синку.
 *
 * Запис іде для КОЖНОГО постачальника, до якого прив'язаний артикул: перезапише
 * ціну той із них, чий синк відпрацює наступним.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductMarkup = {
  sku: string;
  markup_retail?:    number | null;
  markup_wholesale?: number | null;
  markup_drop?:      number | null;
  fixed_retail?:     number | null;
  fixed_wholesale?:  number | null;
  fixed_drop?:       number | null;
};

/** Повертає список помилок; порожній — усе збережено. */
export async function saveProductMarkups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  items: ProductMarkup[],
): Promise<string[]> {
  if (!items.length) return [];

  const skus = [...new Set(items.map(i => i.sku))];
  const bySku = new Map<string, number[]>();
  // Мапа може бути великою — беремо порціями, щоб не впертись у ліміт .in()
  for (let i = 0; i < skus.length; i += 300) {
    const { data, error } = await db
      .from('supplier_sku_map')
      .select('our_sku, supplier_id')
      .in('our_sku', skus.slice(i, i + 300));
    if (error) return [error.message];
    for (const m of data ?? []) {
      const list = bySku.get(m.our_sku) ?? [];
      list.push(m.supplier_id);
      bySku.set(m.our_sku, list);
    }
  }

  const rows = buildOverrideRows(items, bySku, new Date().toISOString());

  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db
      .from('supplier_product_overrides')
      .upsert(rows.slice(i, i + 200), { onConflict: 'supplier_id,our_sku' });
    if (error) errors.push(error.message);
  }
  return errors;
}

/**
 * Рядки для upsert: один товар → по рядку на кожного свого постачальника.
 * Поля, яких у переоцінці не було, не потрапляють у запит взагалі — інакше
 * зміна лише роздрібної наценки затирала б наценки опту й дропу нулями.
 * Виділено окремо, щоб покрити тестом без походу в базу.
 */
export function buildOverrideRows(
  items: ProductMarkup[],
  bySku: Map<string, number[]>,
  now: string,
): Record<string, unknown>[] {
  // Дедуплікація за (постачальник, товар): у supplier_sku_map той самий наш
  // артикул може бути прив'язаний до двох артикулів постачальника, і Postgres
  // на такий upsert відповідає «ON CONFLICT DO UPDATE cannot affect row a second
  // time» — падав увесь пакет наценок.
  const rows = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    for (const supplierId of new Set(bySku.get(item.sku) ?? [])) {
      rows.set(supplierId + ":" + item.sku, {
        supplier_id: supplierId,
        our_sku:     item.sku,
        ...(item.markup_retail    !== undefined && { markup_retail:    item.markup_retail }),
        ...(item.markup_wholesale !== undefined && { markup_wholesale: item.markup_wholesale }),
        ...(item.markup_drop      !== undefined && { markup_drop:      item.markup_drop }),
        ...(item.fixed_retail     !== undefined && { fixed_retail:     item.fixed_retail }),
        ...(item.fixed_wholesale  !== undefined && { fixed_wholesale:  item.fixed_wholesale }),
        ...(item.fixed_drop       !== undefined && { fixed_drop:       item.fixed_drop }),
        updated_at: now,
      });
    }
  }
  return [...rows.values()];
}

/** Товари, яких немає в жодного постачальника: наценку записати нікуди. */
export function unmappedSkus(items: ProductMarkup[], bySku: Map<string, number[]>): string[] {
  return items.map(i => i.sku).filter(sku => !(bySku.get(sku) ?? []).length);
}
