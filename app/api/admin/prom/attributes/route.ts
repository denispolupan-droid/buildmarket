import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { XMLParser } from 'fast-xml-parser';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function assertAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') throw new Error('Unauthorized');
}

// GET /api/admin/prom/attributes?category=<prom_category_id>
// Returns attributes + values for the product form
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
    const catId = req.nextUrl.searchParams.get('category');
    if (!catId) {
      // Return list of imported categories with attribute counts
      const { data } = await db
        .from('prom_attributes')
        .select('prom_category_id, name_uk')
        .order('prom_category_id');

      const counts: Record<number, number> = {};
      for (const row of data ?? []) {
        counts[row.prom_category_id] = (counts[row.prom_category_id] ?? 0) + 1;
      }
      const categories = Object.entries(counts).map(([id, count]) => ({
        prom_category_id: Number(id),
        attribute_count: count,
      }));
      return NextResponse.json({ categories });
    }

    const { data: attrs } = await db
      .from('prom_attributes')
      .select('*, prom_attribute_values(*)')
      .eq('prom_category_id', Number(catId))
      .order('sort_order');

    return NextResponse.json({ attributes: attrs ?? [] });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/admin/prom/attributes  { xml: string }
// Parses Prom category XML and upserts attributes + values
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
    const { xml } = await req.json() as { xml: string };
    if (!xml || typeof xml !== 'string') {
      return NextResponse.json({ error: 'Потрібен XML' }, { status: 400 });
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['category', 'attribute', 'attribute_value'].includes(name),
    });

    let doc: { categories?: { category?: unknown[] } };
    try {
      doc = parser.parse(xml);
    } catch {
      return NextResponse.json({ error: 'Невалідний XML' }, { status: 400 });
    }

    const categories = doc?.categories?.category ?? [];
    if (categories.length === 0) {
      return NextResponse.json({ error: 'Категорій не знайдено в XML' }, { status: 400 });
    }

    let totalAttrs = 0;
    let totalValues = 0;

    for (const cat of categories as Record<string, unknown>[]) {
      const promCategoryId = Number(cat['@_id']);
      if (!promCategoryId) continue;

      // Delete existing attrs for this category (cascade clears values)
      await db.from('prom_attributes').delete().eq('prom_category_id', promCategoryId);

      const rawAttrs = (cat['attribute'] as Record<string, unknown>[] | undefined) ?? [];
      let sortOrder = 0;

      for (const attr of rawAttrs) {
        const attributeId = Number(attr['@_id']);
        const nameUk = String(attr['@_nameUK'] ?? '');
        const nameRu = String(attr['@_nameRU'] ?? '') || null;
        const type   = String(attr['@_type'] ?? 'singleselect');
        const measureUnitUk = attr['@_measureUnitUK'] ? String(attr['@_measureUnitUK']) : null;
        const valMin = attr['@_min'] != null ? Number(attr['@_min']) : null;
        const valMax = attr['@_max'] != null ? Number(attr['@_max']) : null;

        if (!attributeId || !nameUk) continue;

        const { data: inserted, error } = await db
          .from('prom_attributes')
          .insert({
            prom_category_id: promCategoryId,
            attribute_id: attributeId,
            name_uk: nameUk,
            name_ru: nameRu,
            type,
            measure_unit_uk: measureUnitUk,
            val_min: valMin,
            val_max: valMax,
            sort_order: sortOrder++,
          })
          .select('id')
          .single();

        if (error || !inserted) continue;
        totalAttrs++;

        const rawValues = (attr['attribute_value'] as Record<string, unknown>[] | undefined) ?? [];
        let valSort = 0;
        const valueRows = rawValues
          .map((v) => ({
            prom_attribute_id: inserted.id,
            value_id: Number(v['@_id']),
            name_uk: String(v['@_nameUK'] ?? '') || null,
            name_ru: String(v['@_nameRU'] ?? '') || null,
            sort_order: valSort++,
          }))
          .filter((v) => v.value_id);

        if (valueRows.length > 0) {
          await db.from('prom_attribute_values').insert(valueRows);
          totalValues += valueRows.length;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      categories: categories.length,
      attributes: totalAttrs,
      values: totalValues,
    });
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/admin/prom/attributes?category=<prom_category_id>
export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin();
    const catId = req.nextUrl.searchParams.get('category');
    if (!catId) return NextResponse.json({ error: 'Потрібен category' }, { status: 400 });

    await db.from('prom_attributes').delete().eq('prom_category_id', Number(catId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
