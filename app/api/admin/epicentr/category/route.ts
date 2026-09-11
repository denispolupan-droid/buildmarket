import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

const num = (v: unknown): number | null => (v === '' || v == null ? null : Number(v));

// PATCH: комісія / націнка / код категорії Епіцентру для категорії
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json() as {
    slug?: string;
    epicentr_commission_pct?: string | number | null;
    epicentr_markup_pct?: string | number | null;
    epicentr_category_code?: string | null;
  };
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  for (const k of ['epicentr_commission_pct', 'epicentr_markup_pct'] as const) {
    if (body[k] !== undefined) {
      const n = num(body[k]);
      if (n !== null && !Number.isFinite(n)) return NextResponse.json({ error: `Некоректне значення ${k}` }, { status: 400 });
      update[k] = n;
    }
  }
  if (body.epicentr_category_code !== undefined) {
    update.epicentr_category_code = (body.epicentr_category_code ?? '').trim() || null;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { error } = await createServiceClient().from('categories').update(update).eq('slug', body.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
