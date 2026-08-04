import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Entries that have expired and haven't been reverted yet
  const { data: expired } = await db
    .from('price_change_log')
    .select('id, snapshot')
    .eq('is_promo', true)
    .lte('revert_at', today)
    .is('reverted_at', null);

  if (!expired?.length) {
    return NextResponse.json({ reverted: 0 });
  }

  // SKUs from expired entries
  const expiredSkus = [
    ...new Set(
      expired.flatMap(e =>
        ((e.snapshot as { sku: string }[]) ?? []).map(s => s.sku)
      )
    ),
  ];

  // Active promo entries that haven't expired — protect their SKUs from revert
  const { data: stillActive } = await db
    .from('price_change_log')
    .select('snapshot')
    .eq('is_promo', true)
    .is('reverted_at', null)
    .gt('revert_at', today);

  const protectedSkus = new Set<string>(
    (stillActive ?? []).flatMap(e =>
      ((e.snapshot as { sku: string }[]) ?? []).map(s => s.sku)
    )
  );

  const skusToRevert = expiredSkus.filter(sku => !protectedSkus.has(sku));

  if (skusToRevert.length > 0) {
    await db
      .from('product_stock')
      .update({ price_promo: null, updated_at: new Date().toISOString() })
      .in('sku', skusToRevert);

    // Ціна змінилася в обхід адмінки — без цього листинги віддавали б скасовану
    // акційну ціну до природного протухання кешу (адмінські роути це вже роблять).
    revalidateTag('products', 'max');
  }

  // Mark all expired entries as processed
  await db
    .from('price_change_log')
    .update({ reverted_at: new Date().toISOString() })
    .in('id', expired.map(e => e.id));

  return NextResponse.json({ reverted: skusToRevert.length, processed: expired.length });
}
