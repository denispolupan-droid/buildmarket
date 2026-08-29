import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { loadCharDictionary, normalizeChars } from '../../../../../lib/characteristics';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const maxDuration = 120;

// Детермінована нормалізація характеристик (без AI, безкоштовно):
// канонізація лейблів за словником + злиття дублів + порядок sort_order.
// POST { skus: string[] } → { ok, changed: string[] }
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const { skus } = await req.json() as { skus?: string[] };
  if (!skus?.length || skus.length > 500) {
    return NextResponse.json({ error: 'Передайте skus (1-500)' }, { status: 400 });
  }

  const dict = await loadCharDictionary(serviceClient);
  if (!dict.sortMap.size) {
    return NextResponse.json({ error: 'Словник характеристик порожній — спершу заповніть characteristic_definitions' }, { status: 409 });
  }

  const { data: rows, error } = await serviceClient
    .from('product_characteristics')
    .select('id, product_sku, label, value, sort_order')
    .in('product_sku', skus)
    .limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bySku = new Map<string, { id: number; label: string; value: string; sort_order: number }[]>();
  for (const r of rows ?? []) {
    if (!bySku.has(r.product_sku)) bySku.set(r.product_sku, []);
    bySku.get(r.product_sku)!.push(r);
  }

  // Категорія потрібна для канонізації значень: правила фасетів прив'язані до родин
  const { data: prods } = await serviceClient.from('products').select('sku, category_slug').in('sku', skus).limit(500);
  const catOf = new Map((prods ?? []).map(p => [p.sku as string, (p.category_slug as string | null) ?? null]));

  const changed: string[] = [];
  for (const [sku, charRows] of bySku) {
    const sorted = [...charRows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    const normalized = normalizeChars(sorted, dict, catOf.get(sku) ?? null);
    const same = normalized.length === sorted.length
      && normalized.every((n, i) => n.label === sorted[i].label && n.value === sorted[i].value && n.sort_order === sorted[i].sort_order);
    if (same) continue;

    const { error: delErr } = await serviceClient.from('product_characteristics').delete().eq('product_sku', sku);
    if (delErr) return NextResponse.json({ error: `${sku}: ${delErr.message}`, changed }, { status: 500 });
    const { error: insErr } = await serviceClient.from('product_characteristics')
      .insert(normalized.map(c => ({ product_sku: sku, ...c })));
    if (insErr) return NextResponse.json({ error: `${sku}: ${insErr.message}`, changed }, { status: 500 });
    changed.push(sku);
  }

  if (changed.length) revalidateTag('products', 'max');
  return NextResponse.json({ ok: true, changed });
}
