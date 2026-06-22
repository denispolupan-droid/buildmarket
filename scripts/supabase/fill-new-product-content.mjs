/**
 * fill-new-product-content.mjs
 * Генерує описи, ключові слова та характеристики для товарів через Claude API.
 * Характеристики консистентні в межах категорії: кожен наступний товар
 * бачить вже існуючі ярлики своєї категорії і використовує ті ж назви.
 *
 * node scripts/supabase/fill-new-product-content.mjs --sku=1610-105 --dry-run
 * node scripts/supabase/fill-new-product-content.mjs --skus=1610-105,1566-210
 * node scripts/supabase/fill-new-product-content.mjs               (40 нових товарів)
 * node scripts/supabase/fill-new-product-content.mjs --all          (всі товари)
 * node scripts/supabase/fill-new-product-content.mjs --all --active-only
 * node scripts/supabase/fill-new-product-content.mjs --category=farby
 */

import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Env ─────────────────────────────────────────────────────────────────────
const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

// ── Args ─────────────────────────────────────────────────────────────────────
const DRY_RUN     = process.argv.includes('--dry-run');
const ALL         = process.argv.includes('--all');
const ACTIVE_ONLY = process.argv.includes('--active-only');
const SINGLE_SKU  = process.argv.find(a => a.startsWith('--sku='))?.slice(6);
const MULTI_SKUS  = process.argv.find(a => a.startsWith('--skus='))?.slice(7)?.split(',');
const CATEGORY    = process.argv.find(a => a.startsWith('--category='))?.slice(11);
// Only process products with fewer than N characteristics (0 = no filter)
const MAX_CHARS   = parseInt(process.argv.find(a => a.startsWith('--max-chars='))?.slice(12) ?? '0');
// Only process products with N or more characteristics (0 = no filter)
const MIN_CHARS   = parseInt(process.argv.find(a => a.startsWith('--min-chars='))?.slice(12) ?? '0');

const DEFAULT_SKUS = [
  '1610-105','1566-211','1566-210','1568-031','1568-030',
  '2007-034','2007-041','2530-002','1800-128','2528-105',
  '2528-114','2528-106','2528-107','1800-190','1507-029',
  '1610-005','1600-088','1600-081','5096-318','5096-312',
  '5596-269','5596-243','5596-207','1600-089','1591-044',
  '1591-042','5596-279','5508-001','1610-097','5096-313',
  '5096-314','1566-107','1610-085','5596-268','5596-278',
  '2716-047','1509-002','1509-001','1566-104','1509-004',
];

// ── Category label context ──────────────────────────────────────────────────
const labelCache = {}; // categorySlug → string[]

async function getCategoryLabels(categorySlug) {
  if (!categorySlug) return [];
  if (labelCache[categorySlug]) return labelCache[categorySlug];

  const { data } = await supabase
    .from('product_characteristics')
    .select('label, product_sku, products!inner(category_slug)')
    .eq('products.category_slug', categorySlug)
    .limit(300);

  if (!data?.length) { labelCache[categorySlug] = []; return []; }

  const counts = {};
  for (const row of data) counts[row.label] = (counts[row.label] ?? 0) + 1;

  const labels = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([label]) => label);

  labelCache[categorySlug] = labels;
  return labels;
}

// ── Prompt ──────────────────────────────────────────────────────────────────
function buildPrompt(product, categoryLabels) {
  const labelsHint = categoryLabels.length > 0
    ? `\nСТАНДАРТНІ ЯРЛИКИ ХАРАКТЕРИСТИК ДЛЯ ЦІЄї КАТЕГОРІЇ (використовуй САМЕ ЦІ назви, якщо підходять):\n${categoryLabels.map(l => `  • ${l}`).join('\n')}\n`
    : '';

  return `Ти досвідчений SEO-копірайтер для українського B2B магазину будівельної хімії FIXLINE.
Твоє завдання — написати якісний контент для картки товару.

ТОВАР:
- Назва (UA): ${product.name}
- Назва (RU): ${product.name_ru ?? ''}
- Бренд: ${product.brand}
- Категорія: ${product.category_slug ?? ''}
- Поточний короткий опис: ${product.description ?? ''}
${labelsHint}
ВИМОГИ:
1. description_ua — короткий опис 150-220 символів. Конкретно, без води. Пояснює ЩО це і ДЛЯ ЧОГО.
2. description_ru — те саме росiйською мовою.
3. description_full_ua — розгорнутий SEO-опис 400-600 символів. 2-3 абзаци: призначення → технічні переваги → де застосовується. Природний текст, без маркованих списків.
4. description_full_ru — те саме росiйською мовою.
5. keywords_ua — 12-18 пошукових фраз через кому. Включай: назву бренду, тип товару, синоніми, "купити [назва]", "[назва] ціна", "[назва] оптом", "[назва] Київ". Все малими літерами.
6. keywords_ru — те саме росiйською: 12-18 фраз через кому з "купить", "цена", "оптом".
7. characteristics — масив технічних характеристик товару. Від 6 до 14 рядків.${categoryLabels.length > 0 ? ' ОБОВ\'ЯЗКОВО використовуй стандартні ярлики з переліку вище де це доречно.' : ''} Витягни реальні технічні дані з назви товару (вага, об\'єм, розміри, температура, матеріал тощо). Порядок: спочатку специфічні параметри, останніми — Бренд та Країна виробника.

ВІДПОВІДЬ — тільки валідний JSON без markdown, без пояснень:
{
  "description_ua": "...",
  "description_ru": "...",
  "description_full_ua": "...",
  "description_full_ru": "...",
  "keywords_ua": "...",
  "keywords_ru": "...",
  "characteristics": [
    {"label": "Тип", "value": "..."},
    {"label": "Бренд", "value": "..."},
    {"label": "Країна виробника", "value": "..."}
  ]
}`;
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate(product, categoryLabels) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: buildPrompt(product, categoryLabels) }],
  });

  const raw = msg.content[0]?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`JSON не знайдено у відповіді`);

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON parse error: ${e.message}`);
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────
async function save(sku, data) {
  const { error: prodErr } = await supabase.from('products').update({
    description:          data.description_ua,
    description_ru:       data.description_ru,
    description_full:     data.description_full_ua,
    description_full_ru:  data.description_full_ru,
    keywords:             data.keywords_ua,
    keywords_ru:          data.keywords_ru,
  }).eq('sku', sku);

  if (prodErr) throw new Error(`products update: ${prodErr.message}`);

  await supabase.from('product_characteristics').delete().eq('product_sku', sku);

  if (data.characteristics?.length) {
    const rows = data.characteristics.map((c, i) => ({
      product_sku: sku,
      label:       c.label,
      value:       c.value,
      sort_order:  i + 1,
    }));
    const { error: charErr } = await supabase.from('product_characteristics').insert(rows);
    if (charErr) throw new Error(`characteristics insert: ${charErr.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Генерація контенту товарів');
  if (DRY_RUN) console.log('🔍 DRY RUN — без запису в БД');
  if (ALL)     console.log('📦 Режим: ВСІ товари');
  console.log();

  let query = supabase
    .from('products')
    .select('sku, name, name_ru, brand, category_slug, description, description_ru')
    .order('category_slug')   // process by category for consistent labels
    .order('sku');

  if (ALL) {
    if (ACTIVE_ONLY) query = query.eq('is_active', true);
    if (CATEGORY)    query = query.eq('category_slug', CATEGORY);
  } else if (SINGLE_SKU) {
    query = query.eq('sku', SINGLE_SKU);
  } else if (MULTI_SKUS) {
    query = query.in('sku', MULTI_SKUS);
  } else {
    query = query.in('sku', DEFAULT_SKUS);
  }

  let { data: products, error } = await query;
  if (error) { console.error('❌ DB error:', error.message); process.exit(1); }

  // Filter by characteristics count if --max-chars or --min-chars specified
  if ((MAX_CHARS > 0 || MIN_CHARS > 0) && products?.length) {
    const countMap = {};
    const batchSize = 200;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize).map(p => p.sku);
      const { data } = await supabase
        .from('product_characteristics')
        .select('product_sku')
        .in('product_sku', batch)
        .limit(10000);
      for (const row of data ?? []) {
        countMap[row.product_sku] = (countMap[row.product_sku] ?? 0) + 1;
      }
    }
    if (MAX_CHARS > 0) {
      products = products.filter(p => (countMap[p.sku] ?? 0) < MAX_CHARS);
      console.log(`🔍 Після фільтру --max-chars=${MAX_CHARS}: ${products.length} товарів`);
    }
    if (MIN_CHARS > 0) {
      products = products.filter(p => (countMap[p.sku] ?? 0) >= MIN_CHARS);
      console.log(`🔍 Після фільтру --min-chars=${MIN_CHARS}: ${products.length} товарів`);
    }
  }

  const found = products ?? [];
  console.log(`📦 Товарів до обробки: ${found.length}`);
  if (ALL) {
    const mins = Math.ceil(found.length * 9 / 60);
    console.log(`⏱  Орієнтовний час: ~${mins} хв (${Math.ceil(mins/60)} год)`);
  }
  console.log();

  if (found.length === 0) { console.log('Нічого не знайдено.'); return; }

  let ok = 0, fail = 0;
  let lastCategory = null;
  let categoryLabels = [];

  for (const product of found) {
    try {
      await new Promise(r => setTimeout(r, 600));

      // Refresh label context when category changes
      if (product.category_slug !== lastCategory) {
        categoryLabels = await getCategoryLabels(product.category_slug);
        lastCategory = product.category_slug;
      }

      const data = await generate(product, categoryLabels);

      if (DRY_RUN) {
        console.log(`\n[${product.sku}] ${product.name}`);
        console.log(`  Категорія: ${product.category_slug} | Ярлики контексту: ${categoryLabels.length ? categoryLabels.slice(0,5).join(', ') : 'немає'}`);
        console.log(`  description_ua: ${data.description_ua?.slice(0, 100)}...`);
        console.log(`  characteristics (${data.characteristics?.length}):`);
        data.characteristics?.slice(0, 5).forEach(c => console.log(`    • ${c.label}: ${c.value}`));
      } else {
        await save(product.sku, data);

        // Update local cache with new labels from this product
        if (data.characteristics?.length && product.category_slug) {
          for (const c of data.characteristics) {
            if (!categoryLabels.includes(c.label)) {
              categoryLabels = [...categoryLabels, c.label].slice(0, 15);
            }
          }
          labelCache[product.category_slug] = categoryLabels;
        }

        ok++;
        process.stdout.write(`\r  ✅ ${ok}/${found.length} — ${product.sku} [${product.category_slug}]          `);
      }
    } catch (e) {
      fail++;
      console.log(`\n  ❌ ${product.sku}: ${e.message}`);
    }
  }

  if (!DRY_RUN) {
    console.log(`\n\n📊 Готово! Успішно: ${ok} | Помилки: ${fail}\n`);
  }
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
