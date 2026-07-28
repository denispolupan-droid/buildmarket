import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { XMLParser } from 'fast-xml-parser';
import { normCharKey } from '../../../../../lib/characteristics';

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

const CATEGORY_MATERIAL: Record<string, string> = {
  'montazhna-pina':     'Поліуретан',
  'pistoletna-pina':    'Поліуретан',
  'pobutova-pina':      'Поліуретан',
  'vohnezakhysna-pina': 'Поліуретан',
  'pina-klei':          'Поліуретан',
};

const CATEGORY_SEASON: Record<string, string> = {
  'montazhna-pina':     'Всесезонний',
  'pistoletna-pina':    'Всесезонний',
  'pobutova-pina':      'Всесезонний',
  'vohnezakhysna-pina': 'Всесезонний',
  'pina-klei':          'Всесезонний',
};

const CATEGORY_RELEASE_METHOD: Record<string, string> = {
  'pistoletna-pina': 'Професійний пістолет',
  'pobutova-pina':   'Трубка-адаптер',
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
    .select('sku, name, category_slug, volume, color')
    .in('category_slug', slugs)
    .eq('is_active', true);
  if (!products || products.length === 0) return { productsChecked: 0, charsAdded: 0 };

  const skus = products.map((p) => p.sku);

  // Existing characteristics per SKU (label → value)
  const { data: existingChars } = await db
    .from('product_characteristics')
    .select('product_sku, label, value')
    .in('product_sku', skus);

  // Ключі — нормалізовані (апостроф/регістр), щоб "Об`єм" і "Об'єм" не плодили дублі
  const existingBysku: Record<string, Map<string, string>> = {};
  for (const c of existingChars ?? []) {
    if (!existingBysku[c.product_sku]) existingBysku[c.product_sku] = new Map();
    existingBysku[c.product_sku].set(normCharKey(c.label), c.value);
  }

  const toInsert: { product_sku: string; label: string; value: string; sort_order: number }[] = [];

  for (const product of products) {
    const existing = existingBysku[product.sku] ?? new Map<string, string>();
    const slug = product.category_slug ?? '';

    const addIfMissing = (label: string, value: string | null) => {
      if (!value || existing.has(normCharKey(label))) return;
      existing.set(normCharKey(label), value);
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

    // Область застосування (multiselect): один рядок, значення через "; " —
    // фіди розгортають у кілька <param> по цьому розділювачу
    const areaAttr = attrMap.get('Область застосування');
    if (areaAttr && !existing.has(normCharKey('Область застосування'))) {
      const inferredAreas = CATEGORY_APPLICATION_AREA[slug];
      if (inferredAreas?.length) {
        const values = inferredAreas.map(area =>
          areaAttr.prom_attribute_values.find(v => (v.name_uk ?? '').trim() === area.trim())?.name_uk ?? area,
        );
        addIfMissing('Область застосування', values.join('; '));
      }
    }

    // Об'єм (у Prom атрибут називається з гравісом "Об`єм", у нашій БД — канонічний апостроф)
    const volAttr = attrMap.get('Об`єм');
    if (volAttr && !existing.has(normCharKey("Об'єм"))) {
      const ml = parseVolumeML(product.volume);
      if (ml !== null) addIfMissing("Об'єм", String(ml));
    }

    // Колір
    const colorAttr = attrMap.get('Колір');
    if (colorAttr && product.color && !existing.has(normCharKey('Колір'))) {
      const opt = colorAttr.prom_attribute_values.find(
        (v) => (v.name_uk ?? '').trim().toLowerCase() === product.color!.trim().toLowerCase(),
      );
      if (opt?.name_uk) addIfMissing('Колір', opt.name_uk);
    }

    // Основа (for foam categories where Prom attr is "Основа")
    const osnovaAttr = attrMap.get('Основа');
    if (osnovaAttr) {
      const inferred = CATEGORY_MATERIAL[slug];
      if (inferred) {
        const valid = osnovaAttr.prom_attribute_values.find(
          (v) => (v.name_uk ?? '').trim() === inferred.trim(),
        );
        addIfMissing('Основа', valid?.name_uk ?? inferred);
      }
    }

    // Матеріал (for sealant categories where Prom attr is "Матеріал", not "Основа")
    // Copy from existing "Основа" char value (the material is stored as "Основа" in our DB)
    const materialAttr = attrMap.get('Матеріал');
    if (materialAttr && !existing.has(normCharKey('Матеріал'))) {
      const osnoValue = existing.get(normCharKey('Основа'));
      if (osnoValue) {
        const valid = materialAttr.prom_attribute_values.find(
          (v) => (v.name_uk ?? '').trim().toLowerCase() === osnoValue.trim().toLowerCase(),
        );
        addIfMissing('Матеріал', valid?.name_uk ?? osnoValue);
      }
    }

    // Сезон (category default + name override)
    const seasonAttr = attrMap.get('Сезон');
    if (seasonAttr) {
      let inferred = CATEGORY_SEASON[slug];
      if (inferred) {
        const nameLower = (product.name ?? '').toLowerCase();
        if (nameLower.includes('зимн') || nameLower.includes('зима')) inferred = 'Зима';
        else if (nameLower.includes('літн') || nameLower.includes('літо')) inferred = 'Літо';
        const valid = seasonAttr.prom_attribute_values.find(
          (v) => (v.name_uk ?? '').trim() === inferred!.trim(),
        );
        addIfMissing('Сезон', valid?.name_uk ?? inferred);
      }
    }

    // Спосіб випуску з балона (category slug or product name)
    const releaseAttr = attrMap.get('Спосіб випуску з балона');
    if (releaseAttr) {
      const nameLower = (product.name ?? '').toLowerCase();
      let inferred = CATEGORY_RELEASE_METHOD[slug] ?? null;
      if (!inferred) {
        if (nameLower.includes('побутов')) inferred = 'Трубка-адаптер';
        else if (nameLower.includes('профес')) inferred = 'Професійний пістолет';
      }
      if (inferred) {
        const valid = releaseAttr.prom_attribute_values.find(
          (v) => (v.name_uk ?? '').trim() === inferred!.trim(),
        );
        addIfMissing('Спосіб випуску з балона', valid?.name_uk ?? inferred);
      }
    }

    // Температури: якщо немає "застосування" — беремо з "експлуатації" і парсимо число
    const parseTemp = (raw: string) => {
      const n = parseFloat(raw.replace(/[^\d.\-]/g, ''));
      return isNaN(n) ? null : String(n);
    };
    const minTempAttr = attrMap.get('Мінімальна температура застосування');
    if (minTempAttr && !existing.has(normCharKey('Мінімальна температура застосування'))) {
      const src = existing.get(normCharKey('Мінімальна температура експлуатації'));
      if (src) addIfMissing('Мінімальна температура застосування', parseTemp(src));
    }
    const maxTempAttr = attrMap.get('Максимальна температура застосування');
    if (maxTempAttr && !existing.has(normCharKey('Максимальна температура застосування'))) {
      const src = existing.get(normCharKey('Максимальна температура експлуатації'));
      if (src) addIfMissing('Максимальна температура застосування', parseTemp(src));
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
  if (!user || user.app_metadata?.role !== 'admin') throw new Error('Unauthorized');
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

      const catIds = Object.keys(counts).map(Number);
      const { data: catRows } = await db
        .from('categories')
        .select('prom_section_id, name')
        .in('prom_section_id', catIds);

      const catNames: Record<number, string[]> = {};
      for (const c of catRows ?? []) {
        if (!c.prom_section_id) continue;
        if (!catNames[c.prom_section_id]) catNames[c.prom_section_id] = [];
        catNames[c.prom_section_id].push(c.name);
      }

      const categories = Object.entries(counts).map(([id, count]) => ({
        prom_category_id: Number(id),
        attribute_count: count,
        category_names: catNames[Number(id)] ?? [],
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

// PUT /api/admin/prom/attributes
// Re-runs fill for ALL imported categories (no XML needed — reads from DB)
export async function PUT(_req: NextRequest) {
  try {
    await assertAdmin();

    const { data: allAttrs } = await db
      .from('prom_attributes')
      .select('prom_category_id')
      .order('prom_category_id');

    const catIds = [...new Set((allAttrs ?? []).map((r) => r.prom_category_id))];

    let totalProductsChecked = 0;
    let totalCharsAdded = 0;

    for (const promCatId of catIds) {
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
      categoriesProcessed: catIds.length,
      productsChecked: totalProductsChecked,
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
