import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

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
// Batch repricing:  { batch: [{ sku, unit, retail, drop }] }
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
    return NextResponse.json({ ok: true, updated: batch.length });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
