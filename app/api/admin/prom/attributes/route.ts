import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { XMLParser } from 'fast-xml-parser';

// ── Inference maps — keep in sync with fill-prom-chars.mjs ─────────────────
const CATEGORY_USAGE_TYPE: Record<string, string> = {
  'vodoemiulsiyni-interierni':  'Для внутрішніх робіт',
  'farby-dlya-pidlohy':         'Для внутрішніх робіт',
  'farby-dlya-radiatoriv':      'Для внутрішніх робіт',
  'klei-dlya-shpaler':          'Для внутрішніх робіт',
  'pva-ta-stolyarnyi':          'Для внутрішніх робіт',
  'zamazky-dlya-shviv':         'Для внутрішніх робіт',
  'zamazky-epoksydni':          'Для внутрішніх робіт',
  'zamazky-tsementni':          'Для внутрішніх робіт',
  'vologopoglinachi':           'Для внутрішніх робіт',
  'vodoemiulsiyni-fasadni':     'Для зовнішніх робіт',
  'alkidni-farby':              'Для зовнішніх робіт',
  'farby-3v1-alkidni':          'Для зовнішніх робіт',
  'moltkovi-farby':             'Для зовнішніх робіт',
  'bitumni-mastyky':            'Для зовнішніх робіт',
  'bitumni-germetyky':          'Для зовнішніх робіт',
  'hidroizolyatsiya':           'Для зовнішніх робіт',
  'hidroizolyatsiyni-mastyky':  'Для зовнішніх робіт',
  'hermetyzuyucha-strichka':    'Для зовнішніх робіт',
  'praimery':                   'Для зовнішніх робіт',
  'farby':                      'Для внутрішніх і зовнішніх робіт',
  'farby-3v1':                  'Для внутрішніх і зовнішніх робіт',
  'farby-3v1-akrylovi':         'Для внутрішніх і зовнішніх робіт',
  'koloranty':                  'Для внутрішніх і зовнішніх робіт',
  'laky':                       'Для внутрішніх і зовнішніх робіт',
  'morylky':                    'Для внутрішніх і зовнішніх робіт',
  'zakhyst-derevyny':           'Для внутрішніх і зовнішніх робіт',
  'antyseptiky':                'Для внутрішніх і зовнішніх робіт',
  'zakhysni-pokryttya':         'Для внутрішніх і зовнішніх робіт',
  'antygrybok':                 'Для внутрішніх і зовнішніх робіт',
  'gruntivky':                  'Для внутрішніх і зовнішніх робіт',
  'grunty':                     'Для внутрішніх і зовнішніх робіт',
  'gruntivky-gotovi':           'Для внутрішніх і зовнішніх робіт',
  'gruntivky-kontsentraty':     'Для внутрішніх і зовнішніх робіт',
  'betonokontakt':              'Для внутрішніх і зовнішніх робіт',
  'shpaklivky':                 'Для внутрішніх і зовнішніх робіт',
  'izolyatsiyni-strichky':      'Для внутрішніх і зовнішніх робіт',
  'plastyfikatory':             'Для внутрішніх і зовнішніх робіт',
  'plastyfikatory-dlya-betonu': 'Для внутрішніх і зовнішніх робіт',
  'rozchynnyky':                'Для внутрішніх і зовнішніх робіт',
  'ochysnyky':                  'Для внутрішніх і зовнішніх робіт',
  'klei':                       'Для внутрішніх і зовнішніх робіт',
  'kontaktnyi-klei':            'Для внутрішніх і зовнішніх робіт',
  'montazhnyi-klei':            'Для внутрішніх і зовнішніх робіт',
  'klei-dlya-plytky':           'Для внутрішніх і зовнішніх робіт',
  'super-klei':                 'Для внутрішніх і зовнішніх робіт',
  'epoksydni-klei':             'Для внутрішніх і зовнішніх робіт',
  'germetyky':                  'Універсальний',
  'akrylovi-germetyky':         'Універсальний',
  'sylikonovi-germetyky':       'Універсальний',
  'neytralny-germetyky':        'Універсальний',
  'poliuretanovi-germetyky':    'Універсальний',
  'zharostiyki-germetyky':      'Універсальний',
  'ms-polymerni-hermetyky':     'Універсальний',
  'nytka-dlya-trub':            'Універсальний',
  'montazhna-pina':             'Універсальний',
  'pistoletna-pina':            'Універсальний',
  'pobutova-pina':              'Універсальний',
  'vohnezakhysna-pina':         'Універсальний',
  'pina-klei':                  'Універсальний',
};

const CATEGORY_APPLICATION_AREA: Record<string, string[]> = {
  'germetyky':                ['Універсальний'],
  'akrylovi-germetyky':       ['Універсальний'],
  'sylikonovi-germetyky':     ['Санітарний', 'Універсальний'],
  'neytralny-germetyky':      ['Універсальний'],
  'poliuretanovi-germetyky':  ['Покрівельний', 'Універсальний'],
  'zharostiyki-germetyky':    ['Термостійкий'],
  'ms-polymerni-hermetyky':   ['Універсальний'],
  'bitumni-germetyky':        ['Покрівельний'],
  'nytka-dlya-trub':          ['Універсальний'],
  'montazhna-pina':           ['Універсальний'],
  'pistoletna-pina':          ['Універсальний'],
  'pobutova-pina':            ['Універсальний'],
  'vohnezakhysna-pina':       ['Універсальний'],
  'pina-klei':                ['Універсальний'],
};

function parseVolumeML(v: string | null | undefined): number | null {
  if (!v) return null;
  const ml = v.match(/(\d+(?:[.,]\d+)?)\s*мл/i);
  if (ml) return Math.round(parseFloat(ml[1].replace(',', '.')));
  const l = v.match(/(\d+(?:[.,]\d+)?)\s*л(?=[^а-яіїєА-ЯІЇЄ]|$)/i);
  if (l) return Math.round(parseFloat(l[1].replace(',', '.')) * 1000);
  return null;
}

type PromAttr = {
  name_uk: string;
  type: string;
  prom_attribute_values: { name_uk: string | null }[];
};

async function fillProductCharsForCategory(
  promCatId: number,
  attrMap: Map<string, PromAttr>,
): Promise<{ productsChecked: number; charsAdded: number }> {
  // Find category slugs mapped to this prom_section_id
  const { data: cats } = await db.from('categories').select('slug').eq('prom_section_id', promCatId);
  if (!cats || cats.length === 0) return { productsChecked: 0, charsAdded: 0 };
  const slugs = cats.map((c) => c.slug);

  // Active products in those categories
  const { data: products } = await db
    .from('products')
    .select('sku, category_slug, volume, color')
    .in('category_slug', slugs)
    .eq('is_active', true);
  if (!products || products.length === 0) return { productsChecked: 0, charsAdded: 0 };

  const skus = products.map((p) => p.sku);

  // Existing characteristic labels per SKU
  const { data: existingChars } = await db
    .from('product_characteristics')
    .select('product_sku, label')
    .in('product_sku', skus);

  const existingBysku: Record<string, Set<string>> = {};
  for (const c of existingChars ?? []) {
    if (!existingBysku[c.product_sku]) existingBysku[c.product_sku] = new Set();
    existingBysku[c.product_sku].add(c.label);
  }

  const toInsert: { product_sku: string; label: string; value: string; sort_order: number }[] = [];

  for (const product of products) {
    const existing = existingBysku[product.sku] ?? new Set<string>();
    const slug = product.category_slug ?? '';

    const addIfMissing = (label: string, value: string | null) => {
      if (!value || existing.has(label)) return;
      toInsert.push({ product_sku: product.sku, label, value, sort_order: 900 });
    };

    // Тип використання
    const usageAttr = attrMap.get('Тип використання');
    if (usageAttr) {
      const inferred = CATEGORY_USAGE_TYPE[slug];
      if (inferred) {
        const valid = usageAttr.prom_attribute_values.find(
          (v) => (v.name_uk ?? '').trim() === inferred.trim(),
        );
        addIfMissing('Тип використання', valid?.name_uk ?? inferred);
      }
    }

    // Область застосування (multiselect — one row per value)
    const areaAttr = attrMap.get('Область застосування');
    if (areaAttr && !existing.has('Область застосування')) {
      const inferredAreas = CATEGORY_APPLICATION_AREA[slug];
      if (inferredAreas) {
        for (const area of inferredAreas) {
          const opt = areaAttr.prom_attribute_values.find(
            (v) => (v.name_uk ?? '').trim() === area.trim(),
          );
          toInsert.push({
            product_sku: product.sku,
            label: 'Область застосування',
            value: opt?.name_uk ?? area,
            sort_order: 901,
          });
        }
      }
    }

    // Об`єм
    const volAttr = attrMap.get('Об`єм');
    if (volAttr && !existing.has('Об`єм')) {
      const ml = parseVolumeML(product.volume);
      if (ml !== null) addIfMissing('Об`єм', String(ml));
    }

    // Колір
    const colorAttr = attrMap.get('Колір');
    if (colorAttr && product.color && !existing.has('Колір')) {
      const opt = colorAttr.prom_attribute_values.find(
        (v) => (v.name_uk ?? '').trim().toLowerCase() === product.color!.trim().toLowerCase(),
      );
      if (opt?.name_uk) addIfMissing('Колір', opt.name_uk);
    }
  }

  if (toInsert.length === 0) return { productsChecked: products.length, charsAdded: 0 };

  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.from('product_characteristics').insert(toInsert.slice(i, i + BATCH));
  }

  return { productsChecked: products.length, charsAdded: toInsert.length };
}

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

    // After importing, fill missing product characteristics for each imported category
    let totalProductsChecked = 0;
    let totalCharsAdded = 0;

    const importedCatIds = [...new Set(
      (categories as Record<string, unknown>[]).map((c) => Number(c['@_id'])).filter(Boolean)
    )];

    for (const promCatId of importedCatIds) {
      const { data: freshAttrs } = await db
        .from('prom_attributes')
        .select('*, prom_attribute_values(*)')
        .eq('prom_category_id', promCatId)
        .order('sort_order');

      if (!freshAttrs || freshAttrs.length === 0) continue;
      const attrMap = new Map<string, PromAttr>(freshAttrs.map((a) => [a.name_uk, a as PromAttr]));

      const result = await fillProductCharsForCategory(promCatId, attrMap);
      totalProductsChecked += result.productsChecked;
      totalCharsAdded += result.charsAdded;
    }

    return NextResponse.json({
      ok: true,
      categories: categories.length,
      attributes: totalAttrs,
      values: totalValues,
      productsUpdated: totalProductsChecked,
      charsAdded: totalCharsAdded,
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
