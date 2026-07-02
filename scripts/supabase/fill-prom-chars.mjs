/**
 * fill-prom-chars.mjs
 *
 * Fills missing Prom-structured characteristics in product_characteristics
 * for products whose category has prom_section_id set.
 *
 * Run: node scripts/supabase/fill-prom-chars.mjs [--dry-run]
 *
 * What it fills (only if missing):
 *   - Тип використання   → inferred from category slug
 *   - Область застосування → inferred from category slug (matched against prom_attribute_values)
 *   - Об`єм              → parsed from products.volume (в мл)
 *   - Колір              → from products.color (matched against prom_attribute_values)
 *
 * Skips products that already have the characteristic.
 * Safe to run multiple times (idempotent).
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Config ─────────────────────────────────────────────────────────────────
const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN = process.argv.includes('--dry-run');

// ── Inference maps (keep in sync with ProductForm.tsx + prom-feed/route.ts) ─
const CATEGORY_USAGE_TYPE = {
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

const CATEGORY_APPLICATION_AREA = {
  'germetyky':                  ['Універсальний'],
  'akrylovi-germetyky':         ['Універсальний'],
  'sylikonovi-germetyky':       ['Санітарний', 'Універсальний'],
  'neytralny-germetyky':        ['Універсальний'],
  'poliuretanovi-germetyky':    ['Покрівельний', 'Універсальний'],
  'zharostiyki-germetyky':      ['Термостійкий'],
  'ms-polymerni-hermetyky':     ['Універсальний'],
  'bitumni-germetyky':          ['Покрівельний'],
  'nytka-dlya-trub':            ['Універсальний'],
  'montazhna-pina':             ['Універсальний'],
  'pistoletna-pina':            ['Універсальний'],
  'pobutova-pina':              ['Універсальний'],
  'vohnezakhysna-pina':         ['Універсальний'],
  'pina-klei':                  ['Універсальний'],
};

function parseVolumeML(v) {
  if (!v) return null;
  const ml = v.match(/(\d+(?:[.,]\d+)?)\s*мл/i);
  if (ml) return Math.round(parseFloat(ml[1].replace(',', '.')));
  const l = v.match(/(\d+(?:[.,]\d+)?)\s*л(?=[^а-яіїєА-ЯІЇЄ]|$)/i);
  if (l) return Math.round(parseFloat(l[1].replace(',', '.')) * 1000);
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — нічого не буде записано' : '✏️  LIVE RUN');

  // 1. Load categories with prom_section_id
  const { data: cats } = await db
    .from('categories')
    .select('slug, prom_section_id')
    .not('prom_section_id', 'is', null);

  const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c.prom_section_id]));
  const promCatIds = [...new Set(cats.map(c => c.prom_section_id))];
  console.log(`Категорій з Prom ID: ${cats.length} (${promCatIds.length} унікальних prom_section_id)`);

  // 2. Load Prom attributes for those categories
  const { data: promAttrs } = await db
    .from('prom_attributes')
    .select('*, prom_attribute_values(*)')
    .in('prom_category_id', promCatIds);

  // Group: prom_category_id → Map<name_uk, attr>
  const attrsByCat = {};
  for (const attr of promAttrs ?? []) {
    if (!attrsByCat[attr.prom_category_id]) attrsByCat[attr.prom_category_id] = new Map();
    attrsByCat[attr.prom_category_id].set(attr.name_uk, attr);
  }
  console.log(`Prom атрибутів завантажено: ${promAttrs?.length ?? 0}`);

  // 3. Load all active Prom products with category
  const catSlugs = cats.map(c => c.slug);
  const { data: products } = await db
    .from('products')
    .select('sku, category_slug, volume, color')
    .in('category_slug', catSlugs)
    .eq('is_active', true);

  console.log(`Товарів для обробки: ${products?.length ?? 0}`);

  // 4. Load existing characteristics for those products
  const skus = products.map(p => p.sku);
  const { data: existingChars } = await db
    .from('product_characteristics')
    .select('product_sku, label, value')
    .in('product_sku', skus);

  // Group: sku → Set<label>
  const charsBysku = {};
  for (const c of existingChars ?? []) {
    if (!charsBysku[c.product_sku]) charsBysku[c.product_sku] = new Set();
    charsBysku[c.product_sku].add(c.label);
  }

  // 5. Build insert list
  const toInsert = [];
  let skipped = 0;

  for (const product of products) {
    const promCatId = catBySlug[product.category_slug];
    const attrs = attrsByCat[promCatId];
    if (!attrs) continue;

    const existingLabels = charsBysku[product.sku] ?? new Set();
    const slug = product.category_slug;

    // Helper: add if missing
    const addIfMissing = (label, value) => {
      if (!value || existingLabels.has(label)) return;
      toInsert.push({ product_sku: product.sku, label, value, sort_order: 900 });
    };

    // ── Тип використання (singleselect) ──────────────────────────────────
    const usageAttr = attrs.get('Тип використання');
    if (usageAttr) {
      const inferred = CATEGORY_USAGE_TYPE[slug];
      if (inferred) {
        // Validate against prom_attribute_values
        const valid = usageAttr.prom_attribute_values.find(
          v => (v.name_uk ?? '').trim() === inferred.trim()
        );
        if (valid) addIfMissing('Тип використання', valid.name_uk);
        else addIfMissing('Тип використання', inferred);
      }
    }

    // ── Область застосування (multiselect) ───────────────────────────────
    const areaAttr = attrs.get('Область застосування');
    if (areaAttr && !existingLabels.has('Область застосування')) {
      const inferredAreas = CATEGORY_APPLICATION_AREA[slug];
      if (inferredAreas) {
        for (const area of inferredAreas) {
          const opt = areaAttr.prom_attribute_values.find(
            v => (v.name_uk ?? '').trim() === area.trim()
          );
          const val = opt?.name_uk ?? area;
          toInsert.push({ product_sku: product.sku, label: 'Область застосування', value: val, sort_order: 901 });
        }
      }
    }

    // ── Об`єм (real, мл) ─────────────────────────────────────────────────
    const volAttr = attrs.get('Об`єм');
    if (volAttr && !existingLabels.has('Об`єм')) {
      const ml = parseVolumeML(product.volume);
      if (ml !== null) addIfMissing('Об`єм', String(ml));
    }

    // ── Колір (singleselect) ─────────────────────────────────────────────
    const colorAttr = attrs.get('Колір');
    if (colorAttr && product.color && !existingLabels.has('Колір')) {
      const opt = colorAttr.prom_attribute_values.find(
        v => (v.name_uk ?? '').trim().toLowerCase() === product.color.trim().toLowerCase()
      );
      if (opt?.name_uk) addIfMissing('Колір', opt.name_uk);
    }
  }

  console.log(`\nДо запису: ${toInsert.length} рядків`);

  // Preview
  const preview = {};
  for (const r of toInsert) {
    const key = r.label;
    if (!preview[key]) preview[key] = 0;
    preview[key]++;
  }
  for (const [label, count] of Object.entries(preview)) {
    console.log(`  ${label}: ${count} товарів`);
  }

  if (DRY_RUN || toInsert.length === 0) {
    console.log(toInsert.length === 0 ? '\n✅ Нічого не потрібно додавати' : '\n🔍 Dry run — записів не зроблено');
    return;
  }

  // 6. Insert in batches of 200
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from('product_characteristics').insert(batch);
    if (error) {
      console.error(`Помилка batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Записано: ${inserted}/${toInsert.length}`);
    }
  }
  console.log(`\n✅ Готово! Додано ${inserted} рядків`);
}

main().catch(console.error);
