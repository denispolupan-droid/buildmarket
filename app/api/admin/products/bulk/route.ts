import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// PostgREST кладе `sku=in.(...)` в URL — на кількох сотнях SKU він впирається в ліміт
// довжини рядка запиту, тому будь-яку масову операцію ріжемо на пачки.
const CHUNK = 100;

function chunked<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

// Поля, які можна міняти пачкою. rozetka_smart свідомо ВІДСУТНІЙ: підключення Smart
// живе лише в кабінеті Rozetka (API немає), тож масова зміна прапорця у нас миттєво
// розсинхронізувала б базу з кабінетом. Для нього є окремий екран «Товари Rozetka».
const BOOL_FIELDS = ['is_active', 'is_hit', 'is_new', 'on_prom', 'on_rozetka'] as const;
const PCT_FIELDS  = ['prom_markup_pct', 'rozetka_markup_pct'] as const;

type BulkBody = {
  skus?: unknown;
  action?: unknown;
  patch?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json() as BulkBody;

  const skus = Array.isArray(body.skus)
    ? [...new Set(body.skus.filter((s): s is string => typeof s === 'string' && s.length > 0))]
    : [];
  if (!skus.length) return NextResponse.json({ error: 'Не вибрано жодного товару' }, { status: 400 });

  /* ── Видалення ──────────────────────────────────────────────────────────── */
  if (body.action === 'delete') {
    for (const part of chunked(skus)) {
      // Спочатку залежні таблиці — інакше FK не дадуть видалити товар
      await Promise.allSettled([
        serviceClient.from('product_characteristics').delete().in('product_sku', part),
        serviceClient.from('product_stock').delete().in('sku', part),
        serviceClient.from('supplier_stock').delete().in('sku', part),
        serviceClient.from('supplier_sku_map').delete().in('our_sku', part),
        serviceClient.from('product_reviews').delete().in('product_sku', part),
      ]);
      const { error } = await serviceClient.from('products').delete().in('sku', part);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    revalidateTag('products', 'max');
    return NextResponse.json({ ok: true, action: 'delete', count: skus.length });
  }

  /* ── Оновлення полів ────────────────────────────────────────────────────── */
  const patch = body.patch ?? {};
  const update: Record<string, unknown> = {};

  for (const f of BOOL_FIELDS) {
    if (f in patch) update[f] = Boolean(patch[f]);
  }

  for (const f of PCT_FIELDS) {
    if (!(f in patch)) continue;
    // null = «скинути до націнки категорії»
    if (patch[f] === null || patch[f] === '') { update[f] = null; continue; }
    const n = Number(patch[f]);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return NextResponse.json({ error: `Некоректна націнка: ${String(patch[f])}` }, { status: 400 });
    }
    update[f] = n;
  }

  if ('category_slug' in patch) {
    const slug = String(patch.category_slug ?? '').trim();
    const { data: cat } = await serviceClient
      .from('categories').select('slug').eq('slug', slug).maybeSingle();
    if (!cat) return NextResponse.json({ error: `Категорія «${slug}» не існує` }, { status: 400 });
    update.category_slug = slug;
  }

  if ('brand' in patch) {
    const brand = String(patch.brand ?? '').trim();
    if (!brand) return NextResponse.json({ error: 'Порожній бренд' }, { status: 400 });
    update.brand = brand;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Немає що змінювати' }, { status: 400 });
  }

  for (const part of chunked(skus)) {
    const { error } = await serviceClient.from('products').update(update).in('sku', part);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('products', 'max');
  return NextResponse.json({ ok: true, count: skus.length, fields: Object.keys(update) });
}
