import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { MP_TARGETS, revertMpEntry, type MpLogEntry } from '../../../../lib/mp-reprice';
import { createServiceClient } from '../../../../lib/supabase-service';
import { processAdjustmentBoundaries } from '../../../../lib/price-adjustments-db';
import { withApi } from '../../../../lib/api-handler';

const db = createServiceClient();

async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // ── Корекції цін МП (міграція 147): почались / закінчились за датою ────────
  // Фіди рахують ціну на льоту, тож тут лише стан і журнал. Ціни сайту не чіпає.
  const adj = await processAdjustmentBoundaries(db);

  // ── Нижче — записи без корекцій (adjustment = false). Фільтр обов'язковий:
  // акції МП теж мають is_promo, і без нього блок акцій сайту зняв би
  // price_promo на сайті в товарів, у яких закінчилась акція на Rozetka/Prom.

  // Тимчасові переоцінки маркетплейсів через націнку: дата «повернути після»
  // настала — повертаються націнки «до» зі знімка.
  const { data: mpExpired } = await db
    .from('price_change_log')
    .select('id, type, target, status, reverted_at, snapshot, created_at, revert_at')
    .in('target', [...MP_TARGETS])
    .eq('adjustment', false)
    .eq('status', 'applied')
    .lte('revert_at', today)
    .is('reverted_at', null);

  let mpReverted = 0;
  const mpErrors: string[] = [];
  for (const entry of (mpExpired ?? []) as MpLogEntry[]) {
    if (entry.type === 'mp_revert') continue;
    const res = await revertMpEntry(db, entry, null, 'cron');
    if (res.ok) mpReverted += res.reverted;
    else mpErrors.push(`#${entry.id}: ${res.error}`);
  }

  // ── Акції сайту: прострочені й ще не повернуті ──────────────────────────────
  const { data: expired } = await db
    .from('price_change_log')
    .select('id, snapshot')
    .eq('is_promo', true)
    .eq('adjustment', false)
    .lte('revert_at', today)
    .is('reverted_at', null);

  if (!expired?.length) {
    return NextResponse.json({ reverted: 0, mp_reverted: mpReverted, mp_errors: mpErrors.slice(0, 10), adjustments: adj });
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
    .eq('adjustment', false)
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

  return NextResponse.json({ reverted: skusToRevert.length, processed: expired.length, mp_reverted: mpReverted, mp_errors: mpErrors.slice(0, 10), adjustments: adj });
}

// Збій крона раніше бачили лише в логах Vercel (аудит 31.10.2026): тепер і
// виняток, і відповідь 5xx ідуть алертом у Telegram (з тротлінгом, lib/alert).
async function _GET(req: NextRequest) {
  try {
    const res = await run(req);
    if (res.status >= 500) alertAdmin('Cron: відкат промо — збій', `HTTP ${res.status}`);
    return res;
  } catch (err) {
    alertAdmin('Cron: відкат промо впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = withApi('cron/revert-promo', _GET);
