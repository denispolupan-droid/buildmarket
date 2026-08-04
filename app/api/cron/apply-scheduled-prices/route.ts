import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SnapshotRow = {
  sku: string;
  after: { unit?: number | null; retail?: number | null; drop?: number | null };
};

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: pending } = await db
    .from('price_change_log')
    .select('id, is_promo, snapshot')
    .eq('status', 'pending')
    .lte('effective_from', now)
    .is('reverted_at', null);

  if (!pending?.length) {
    return NextResponse.json({ applied: 0 });
  }

  const errors: string[] = [];
  const appliedIds: number[] = [];

  for (const entry of pending) {
    const snapshot = (entry.snapshot ?? []) as SnapshotRow[];
    const isPromo = !!entry.is_promo;
    const CHUNK = 20;

    for (let i = 0; i < snapshot.length; i += CHUNK) {
      const chunk = snapshot.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async row => {
        const update: Record<string, unknown> = { updated_at: now };
        if (isPromo) {
          if (row.after.retail != null) update.price_promo = row.after.retail;
          if (row.after.unit   != null) update.price_unit  = row.after.unit;
          if (row.after.drop   != null) update.price_drop  = row.after.drop;
        } else {
          if (row.after.unit   != null) update.price_unit   = row.after.unit;
          if (row.after.retail != null) update.price_retail = row.after.retail;
          if (row.after.drop   != null) update.price_drop   = row.after.drop;
        }
        const { error } = await db.from('product_stock').update(update).eq('sku', row.sku);
        if (error) errors.push(`${row.sku}: ${error.message}`);
      }));
    }

    appliedIds.push(entry.id);
  }

  if (appliedIds.length > 0) {
    await db
      .from('price_change_log')
      .update({ status: 'applied' })
      .in('id', appliedIds);

    // Ціна змінилася в обхід адмінки — без цього листинги віддавали б стару
    // ціну до природного протухання кешу (адмінські роути це вже роблять).
    revalidateTag('products', 'max');
  }

  console.log(`[apply-scheduled-prices] applied=${appliedIds.length} errors=${errors.length}`);
  return NextResponse.json({ applied: appliedIds.length, errors: errors.slice(0, 10) });
}
