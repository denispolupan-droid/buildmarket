import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient, type TableUpdate } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

// PATCH: toggle on_prom or update prom_markup_pct for a single product
async function _PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sku, on_prom, prom_markup_pct } = await req.json();
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (on_prom !== undefined)        update.on_prom        = on_prom;
  if (prom_markup_pct !== undefined) update.prom_markup_pct = prom_markup_pct === '' ? null : Number(prom_markup_pct);

  const { error } = await db.from('products').update(update as TableUpdate<'products'>).eq('sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withApi('admin/prom/product', _PATCH);

// POST: bulk toggle on_prom — for all active products, or a specific category
async function _POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { category_slug, on_prom } = await req.json();

  let query = db.from('products').update({ on_prom }).eq('is_active', true);
  if (category_slug) query = query.eq('category_slug', category_slug);

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = withApi('admin/prom/product', _POST);
