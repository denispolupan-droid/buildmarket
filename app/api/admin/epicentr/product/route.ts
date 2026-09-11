import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

const num = (v: unknown): number | null => (v === '' || v == null ? null : Number(v));

// PATCH: on_epicentr / epicentr_markup_pct одного товару
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { sku, on_epicentr, epicentr_markup_pct } = await req.json() as { sku?: string; on_epicentr?: boolean; epicentr_markup_pct?: string | number | null };
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (on_epicentr !== undefined) update.on_epicentr = Boolean(on_epicentr);
  if (epicentr_markup_pct !== undefined) {
    const n = num(epicentr_markup_pct);
    if (n !== null && !Number.isFinite(n)) return NextResponse.json({ error: 'Некоректна націнка' }, { status: 400 });
    update.epicentr_markup_pct = n;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { error } = await createServiceClient().from('products').update(update).eq('sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST: масово on_epicentr — усі активні або одна категорія
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { category_slug, on_epicentr } = await req.json() as { category_slug?: string; on_epicentr?: boolean };
  if (typeof on_epicentr !== 'boolean') return NextResponse.json({ error: 'on_epicentr required' }, { status: 400 });

  let q = createServiceClient().from('products').update({ on_epicentr }).eq('is_active', true);
  if (category_slug) q = q.eq('category_slug', category_slug);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
