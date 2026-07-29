import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Дострокове завершення акцій: обраних SKU або ВСІХ активних (без skus).
// Знімає price_promo одразу (роздріб повертається сам — він не змінювався),
// закриває відповідні записи журналу і пише окремий запис «Завершення акції».
// POST { skus?: string[] } → { ok, cancelled: number }
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { skus } = await req.json().catch(() => ({})) as { skus?: string[] };

  let query = db.from('product_stock').select('sku, price_promo').not('price_promo', 'is', null);
  if (skus?.length) query = query.in('sku', skus.slice(0, 2000));
  const { data: promoRows, error: selErr } = await query.limit(2000);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!promoRows?.length) return NextResponse.json({ ok: true, cancelled: 0 });

  const cancelledSkus = promoRows.map(r => r.sku);
  const { error: updErr } = await db
    .from('product_stock')
    .update({ price_promo: null, updated_at: new Date().toISOString() })
    .in('sku', cancelledSkus);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Записи журналу, всі товари яких зняті з акції, — закриваємо (reverted_at),
  // щоб крон авто-завершення їх більше не чіпав. Часткові лишаються активними
  // для решти своїх SKU.
  const cancelledSet = new Set(cancelledSkus);
  const { data: activeEntries } = await db
    .from('price_change_log')
    .select('id, snapshot')
    .eq('is_promo', true)
    .is('reverted_at', null)
    .neq('status', 'cancelled');
  const fullyDone = (activeEntries ?? []).filter(e => {
    const entrySkus = ((e.snapshot as { sku: string }[]) ?? []).map(s => s.sku);
    return entrySkus.length > 0 && entrySkus.every(s => cancelledSet.has(s));
  });
  if (fullyDone.length) {
    await db.from('price_change_log')
      .update({ reverted_at: new Date().toISOString() })
      .in('id', fullyDone.map(e => e.id));
  }

  // Назви для снапшота журналу
  const { data: prods } = await db.from('products').select('sku, name').in('sku', cancelledSkus.slice(0, 500));
  const nameOf = new Map((prods ?? []).map(p => [p.sku, p.name]));
  await db.from('price_change_log').insert({
    user_id: auth.user.id,
    type: 'promo_cancel',
    value: 0,
    target: 'retail',
    is_promo: false,
    status: 'applied',
    count: cancelledSkus.length,
    comment: skus?.length ? null : 'Завершено всі активні акції',
    snapshot: promoRows.slice(0, 500).map(r => ({
      sku: r.sku,
      name: nameOf.get(r.sku) ?? r.sku,
      before: { promo: r.price_promo },
      after: { promo: null },
    })),
  });

  revalidateTag('products', 'max');
  return NextResponse.json({ ok: true, cancelled: cancelledSkus.length });
}
