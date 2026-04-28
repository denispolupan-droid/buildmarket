/**
 * generate-descriptions.mjs
 * Генерує SEO-описи товарів (UA + RU) через Claude API.
 *
 * Запуск (dry-run — перші 3 товари):
 *   node scripts/supabase/generate-descriptions.mjs --dry-run
 *
 * Реальний запуск:
 *   node scripts/supabase/generate-descriptions.mjs
 *
 * Тільки один бренд:
 *   node scripts/supabase/generate-descriptions.mjs --brand=Lacrysil
 *
 * Тільки товари без опису:
 *   node scripts/supabase/generate-descriptions.mjs --missing-only
 */

import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase    = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic   = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const DRY_RUN      = process.argv.includes('--dry-run');
const MISSING_ONLY = process.argv.includes('--missing-only');
const BRAND        = process.argv.find(a => a.startsWith('--brand='))?.slice(8);
const BATCH_SIZE   = 2;   // паралельних запитів
const DELAY_MS     = 2000; // пауза між батчами

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Промпт ────────────────────────────────────────────────────────────────────

function buildPrompt(p) {
  const chars = (p.characteristics ?? [])
    .map(c => `${c.label}: ${c.value}`)
    .join(', ');

  return `Ти SEO-копірайтер для українського інтернет-магазину будівельної хімії FIXLINE.

Товар:
- Назва: ${p.name}${p.volume ? ' ' + p.volume : ''}
- Бренд: ${p.brand}
- Категорія: ${p.category_slug ?? ''}
${chars ? `- Характеристики: ${chars}` : ''}

Напиши два коротких SEO-описи для цього товару:

1. Українською (150-250 символів): природний текст, згадай тип товару, де застосовується, ключові переваги. БЕЗ перерахувань і маркованих списків.

2. Російською (150-250 символів): переклад, але не дослівний — адаптований для російськомовного пошуку.

Відповідь тільки в такому форматі (без коментарів, без заголовків):
UA: [опис українською]
RU: [опис російською]`;
}

// ── Парсинг відповіді ─────────────────────────────────────────────────────────

function parseResponse(text) {
  const ua = text.match(/^UA:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const ru = text.match(/^RU:\s*(.+)$/m)?.[1]?.trim() ?? null;
  return { ua, ru };
}

// ── Генерація для одного товару ───────────────────────────────────────────────

async function generateForProduct(p) {
  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages:   [{ role: 'user', content: buildPrompt(p) }],
  });

  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  return parseResponse(text);
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  if (!env['ANTHROPIC_API_KEY']) {
    console.error('❌ ANTHROPIC_API_KEY не знайдено в .env.local');
    process.exit(1);
  }

  console.log('\n✍️  Генерація SEO-описів товарів');
  if (DRY_RUN)      console.log('🔍 DRY RUN — перші 3 товари, без запису');
  if (MISSING_ONLY) console.log('📋 Тільки товари без опису');
  if (BRAND)        console.log(`🔎 Тільки бренд: ${BRAND}`);
  console.log();

  // Завантажуємо товари
  let query = supabase
    .from('products')
    .select('sku, name, brand, volume, category_slug, characteristics:product_characteristics(label, value, sort_order)')
    .eq('is_active', true)
    .order('category_slug, name');

  if (MISSING_ONLY) query = query.is('description', null);
  if (BRAND)        query = query.eq('brand', BRAND);

  const { data: products, error } = await query;
  if (error) { console.error('❌', error.message); process.exit(1); }

  const list = DRY_RUN ? (products ?? []).slice(0, 3) : (products ?? []);
  console.log(`Товарів для обробки: ${list.length}\n`);

  let ok = 0, fail = 0;

  // Обробляємо батчами
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async p => {
      try {
        const { ua, ru } = await generateForProduct(p);

        if (DRY_RUN) {
          console.log(`\n[${p.sku}] ${p.brand} ${p.name}`);
          console.log(`UA: ${ua}`);
          console.log(`RU: ${ru}`);
          return;
        }

        if (!ua || !ru) throw new Error('Порожня відповідь');

        await supabase
          .from('products')
          .update({ description: ua, description_ru: ru })
          .eq('sku', p.sku);

        ok++;
        process.stdout.write(`\r  ✅ ${ok + fail}/${list.length} — ${p.sku}          `);
      } catch (e) {
        fail++;
        console.log(`\n  ❌ ${p.sku}: ${e.message}`);
      }
    }));

    if (i + BATCH_SIZE < list.length) await sleep(DELAY_MS);
  }

  if (!DRY_RUN) {
    console.log(`\n\n📊 Результат:`);
    console.log(`   Успішно:  ${ok}`);
    console.log(`   Помилки:  ${fail}`);
  }

  console.log('\n✅ Готово!\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
