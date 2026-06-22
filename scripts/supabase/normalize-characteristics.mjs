/**
 * normalize-characteristics.mjs
 * Нормалізує значення характеристик в межах кожної категорії.
 * Наприклад: [Акрил, Акрилова, Акрилова дисперсія] → всі стають "Акрилова"
 *
 * node scripts/supabase/normalize-characteristics.mjs --dry-run
 * node scripts/supabase/normalize-characteristics.mjs
 * node scripts/supabase/normalize-characteristics.mjs --category=farby
 * node scripts/supabase/normalize-characteristics.mjs --min-variants=2  (default: 2)
 */

import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Env ──────────────────────────────────────────────────────────────────────
const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

// ── Args ──────────────────────────────────────────────────────────────────────
const DRY_RUN     = process.argv.includes('--dry-run');
const CATEGORY    = process.argv.find(a => a.startsWith('--category='))?.slice(11);
const MIN_VARIANTS = parseInt(process.argv.find(a => a.startsWith('--min-variants='))?.slice(15) ?? '2');

// ── Normalize one label group ─────────────────────────────────────────────────
async function normalizeGroup(categorySlug, label, values) {
  if (values.length < MIN_VARIANTS) return null;

  // Check if values are already consistent enough (all same after basic normalization)
  const lower = values.map(v => v.toLowerCase().trim());
  if (new Set(lower).size === 1) return null;

  const prompt = `Ти нормалізуєш значення характеристик для українського каталогу будівельних матеріалів.

Категорія: ${categorySlug}
Характеристика: "${label}"
Поточні значення в каталозі:
${values.map((v, i) => `  ${i + 1}. "${v}"`).join('\n')}

Завдання: визначити для кожного значення одне канонічне (найбільш правильне) українське слово/фраза.
Правила:
- Якщо значення означають одне і те саме — вибери одне, найкоротше і точне
- Якщо значення реально різні — залиш різними (не об'єднуй те що різне)
- Мова: українська, без зайвих слів ("на основі X" → "X")
- Конкретно: "Алкідна" краще ніж "На алкідній основі"

Відповідь — тільки JSON масив, кожен елемент: {"original": "...", "canonical": "..."}
Масив має містити рівно ${values.length} елементів у тому ж порядку.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0]?.text ?? '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Не знайдено JSON у відповіді для [${categorySlug}] ${label}`);

  const mapping = JSON.parse(match[0]);
  return mapping;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔧 Нормалізація характеристик');
  if (DRY_RUN) console.log('🔍 DRY RUN — без запису в БД\n');

  // Get all distinct category+label+value combinations
  let query = supabase
    .from('product_characteristics')
    .select('product_sku, label, value, products!inner(category_slug, is_active)')
    .eq('products.is_active', true)
    .limit(50000);

  if (CATEGORY) query = query.eq('products.category_slug', CATEGORY);

  const { data: rows, error } = await query;
  if (error) { console.error('❌ DB error:', error.message); process.exit(1); }

  // Group by category → label → [values]
  const groups = {}; // { categorySlug: { label: Set<value> } }
  for (const row of rows ?? []) {
    const cat = row.products?.category_slug ?? '__none__';
    if (!groups[cat]) groups[cat] = {};
    if (!groups[cat][row.label]) groups[cat][row.label] = new Set();
    groups[cat][row.label].add(row.value);
  }

  const categories = Object.keys(groups).sort();
  console.log(`📦 Категорій: ${categories.length}`);

  let totalChanges = 0;
  let totalLabels  = 0;
  let errors = 0;

  for (const cat of categories) {
    const labels = Object.keys(groups[cat]).sort();
    const labelsWithVariants = labels.filter(l => groups[cat][l].size >= MIN_VARIANTS);

    if (labelsWithVariants.length === 0) continue;

    console.log(`\n📂 ${cat} — ${labelsWithVariants.length} ярликів з варіантами`);

    for (const label of labelsWithVariants) {
      const values = Array.from(groups[cat][label]);
      await new Promise(r => setTimeout(r, 300));

      try {
        const mapping = await normalizeGroup(cat, label, values);
        if (!mapping) {
          console.log(`  ✓ "${label}" — вже консистентно`);
          continue;
        }

        // Find pairs that actually change
        const changes = mapping.filter(m => m.original !== m.canonical);

        if (changes.length === 0) {
          console.log(`  ✓ "${label}" — ${values.length} значень, змін немає`);
          continue;
        }

        totalLabels++;
        console.log(`  ⚙ "${label}":`);
        for (const { original, canonical } of changes) {
          console.log(`    "${original}" → "${canonical}"`);
          totalChanges++;

          if (!DRY_RUN) {
            // Get SKUs in this category with this value
            const { data: toUpdate } = await supabase
              .from('product_characteristics')
              .select('id, product_sku, products!inner(category_slug)')
              .eq('label', label)
              .eq('value', original)
              .eq('products.category_slug', cat);

            if (toUpdate?.length) {
              await supabase
                .from('product_characteristics')
                .update({ value: canonical })
                .in('id', toUpdate.map(r => r.id));

              console.log(`      → оновлено ${toUpdate.length} записів`);
            }
          }
        }
      } catch (e) {
        errors++;
        console.log(`  ❌ "${label}": ${e.message}`);
      }
    }
  }

  console.log(`\n📊 Підсумок:`);
  console.log(`   Ярликів нормалізовано: ${totalLabels}`);
  console.log(`   Значень змінено: ${totalChanges}`);
  if (errors) console.log(`   Помилок: ${errors}`);
  if (DRY_RUN) console.log('\n   (DRY RUN — нічого не записано)');
  console.log();
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
