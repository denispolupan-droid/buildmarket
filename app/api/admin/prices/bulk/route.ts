import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { saveProductMarkups, type ProductMarkup } from '../../../../../lib/price-overrides';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && ['admin', 'manager'].includes(user.app_metadata?.role ?? ''));
}

// Single SKU edit: { skus: [sku], price_unit, price_retail, price_drop, price_cost, price_locked }
// Batch repricing:  { batch: [{ sku, unit, retail, drop }], overrides?: [...] }
//
// overrides — наценка (або фіксована ціна) на товар у supplier_product_overrides.
// Без неї переоцінка жила до найближчого синку постачальника: синк рахує ціни
// від прайса за наценкою постачальника й перезаписує product_stock. Тепер
// переоцінка змінює саме наценку, і синк відтворює ту саму ціну від нової
// собівартості (пріоритет у синку: товар > бренд > постачальник).
export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // ── Single edit mode ────────────────────────────────────────────────────────
  if (body.skus) {
    const { skus, price_cost, price_unit, price_retail, price_drop, price_locked } = body as {
      skus:          string[];
      price_cost?:   number | null;
      price_unit?:   number | null;
      price_retail?: number | null;
      price_drop?:   number | null;
      price_locked?: boolean;
    };

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (price_cost    !== undefined) update.price_cost    = price_cost;
    if (price_unit    !== undefined) update.price_unit    = price_unit;
    if (price_retail  !== undefined) update.price_retail  = price_retail;
    if (price_drop    !== undefined) update.price_drop    = price_drop;
    if (price_locked  !== undefined) update.price_locked  = price_locked;

    const { error } = await db.from('product_stock').update(update).in('sku', skus);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Ціни на вітрині живуть у кеші з тегом 'products'. Без скидання нова ціна
    // з'являлась лише коли протухне TTL — до хвилини після збереження.
    revalidateTag('products', 'max');
    return NextResponse.json({ ok: true, updated: skus.length });
  }

  // ── Batch repricing mode ────────────────────────────────────────────────────
  if (body.batch) {
    const batch    = body.batch as { sku: string; unit?: number | null; retail?: number | null; drop?: number | null }[];
    const is_promo = !!body.is_promo;

    const errors: string[] = [];
    const CHUNK = 20;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk = batch.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async item => {
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (is_promo) {
          // Promo mode: write new retail to price_promo, keep price_retail as "old" for site display
          if (item.retail != null) update.price_promo = item.retail;
          // unit/drop still update normally
          if (item.unit != null) update.price_unit = item.unit;
          if (item.drop != null) update.price_drop = item.drop;
        } else {
          if (item.unit   != null) update.price_unit   = item.unit;
          if (item.retail != null) update.price_retail = item.retail;
          if (item.drop   != null) update.price_drop   = item.drop;
        }
        const { error } = await db.from('product_stock').update(update).eq('sku', item.sku);
        if (error) errors.push(`${item.sku}: ${error.message}`);
      }));
    }

    if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 });

    // Наценки — після цін: ціна вже правильна на вітрині, а наценка потрібна,
    // щоб вона такою й лишилась після синку. Помилку тут не ховаємо: без
    // наценки переоцінка знову проживе до наступного синку.
    let overridesSaved = 0;
    if (Array.isArray(body.overrides) && body.overrides.length) {
      const errs = await saveProductMarkups(db, body.overrides as ProductMarkup[]);
      if (errs.length) return NextResponse.json({ error: 'Ціни оновлено, але наценки не збереглись: ' + errs.join('; ') }, { status: 500 });
      overridesSaved = (body.overrides as ProductMarkup[]).length;
    }

    revalidateTag('products', 'max');
    return NextResponse.json({ ok: true, updated: batch.length, overrides: overridesSaved });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
