/**
 * auto-normalize-chars.mjs
 * Автоматично нормалізує значення характеристик по всіх категоріях через Claude API.
 * Claude аналізує дублі і повертає mapping старих значень → канонічних.
 *
 * node scripts/supabase/auto-normalize-chars.mjs --dry-run   (показати зміни)
 * node scripts/supabase/auto-normalize-chars.mjs             (застосувати)
 * node scripts/supabase/auto-normalize-chars.mjs --cat=klei  (тільки одна категорія)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Ініціалізація ─────────────────────────────────────────────────────────────
const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const DRY_RUN   = process.argv.includes('--dry-run');
const CAT_FILTER = process.argv.find(a => a.startsWith('--cat='))?.slice(6) ?? null;
const CACHE_FILE = 'scripts/supabase/.normalize-cache.json';

// Характеристики що не треба нормалізувати через AI (вже чисті або числові)
const SKIP_LABELS = new Set([
  'Мінімальна температура застосування',
  'Максимальна температура застосування',
  'Мінімальна температура експлуатації',
  'Максимальна температура експлуатації',
  'Мінімальна температура зберігання',
  'Максимальна температура зберігання',
  'Час висихання поверхні',
  'Час висихання',
  'Час повного затвердіння',
  'Час початкового схоплення',
  'Час поверхневого висихання',
  'Первинне розширення',
  'Вторинне розширення',
  'Вихід піни',
  'Витрата матеріалу',
  'Витрата',
  'Витрата фарби',
  'Витрата ґрунтовки',
  'Мінімальна ширина шва',
  'Максимальна ширина шва',
  'Термін зберігання',
  'Міцність клейового з\'єднання',
  'Колір',       // вже нормалізовано окремим скриптом
  'Країна виробник', // вже нормалізовано
]);

// ── Промпт для Claude ──────────────────────────────────────────────────────────
function buildPrompt(categorySlug, label, valueCounts) {
  const lines = Object.entries(valueCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `  ${n}x "${v}"`)
    .join('\n');

  return `Ти нормалізуєш характеристики товарів для українського B2B-магазину будматеріалів.

Категорія: ${categorySlug}
Характеристика: "${label}"

Поточні значення (кількість × значення):
${lines}

Твоє завдання:
1. Визнач які значення є ДУБЛЯМИ (однакове значення різними словами, відмінками, скороченнями)
2. Для кожної групи дублів обери ОДНЕ коротке канонічне значення (українська мова, 1-4 слова)
3. Якщо значення безглузде для цієї характеристики — постав null (видалити)
4. Залиш різні значення різними якщо вони реально різні за змістом
5. Мета: покупець зможе зручно фільтрувати товари по цій характеристиці

Поверни ТІЛЬКИ валідний JSON без коментарів:
{
  "mapping": {
    "старе значення": "нове канонічне значення або null для видалення"
  }
}

Правила:
- Якщо значення вже ідеальне — просто не включай його у mapping (або постав те саме значення)
- null означає ВИДАЛЕННЯ запису з БД
- Канонічні значення мають бути КОРОТКИМИ і зрозумілими
- Мова — українська`;
}

// ── Кеш щоб не перезапитувати Claude для вже оброблених пар ─────────────────
function loadCache() {
  if (existsSync(CACHE_FILE)) {
    try { return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')); } catch {}
  }
  return {};
}
function saveCache(cache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Виклик Claude ─────────────────────────────────────────────────────────────
async function askClaude(categorySlug, label, valueCounts) {
  const prompt = buildPrompt(categorySlug, label, valueCounts);
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response: ' + text);
  return JSON.parse(jsonMatch[0]);
}

// ── Головна функція ───────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 Авто-нормалізація характеристик${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  // 1. Завантаження даних
  const allChars = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('product_characteristics')
      .select('id, product_sku, label, value')
      .range(page * 1000, page * 1000 + 999);
    if (error) { console.error('❌', error.message); process.exit(1); }
    if (!data?.length) break;
    allChars.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const { data: products } = await supabase.from('products').select('sku, category_slug, name');
  const catBySku  = Object.fromEntries(products.map(p => [p.sku, p.category_slug ?? '']));
  const nameBySku = Object.fromEntries(products.map(p => [p.sku, p.name ?? '']));

  console.log(`Характеристик: ${allChars.length}, товарів: ${products.length}\n`);

  // 2. Групуємо: category → label → { value: count }
  const groups = {};
  for (const c of allChars) {
    const cat = catBySku[c.product_sku] ?? 'unknown';
    if (CAT_FILTER && !cat.includes(CAT_FILTER)) continue;
    if (SKIP_LABELS.has(c.label)) continue;
    const key = cat + '|||' + c.label;
    if (!groups[key]) groups[key] = {};
    groups[key][c.value] = (groups[key][c.value] || 0) + 1;
  }

  // Фільтруємо: тільки групи з >2 унікальними значеннями
  const toProcess = Object.entries(groups)
    .filter(([, vals]) => Object.keys(vals).length > 2)
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length);

  console.log(`Груп для обробки: ${toProcess.length}\n`);

  // 3. Кеш попередніх запитів
  const cache = loadCache();
  let cacheHits = 0;

  // 4. Збираємо всі mapping-и
  const fullMapping = {}; // id → new value (або null = видалити)

  for (let i = 0; i < toProcess.length; i++) {
    const [key, valueCounts] = toProcess[i];
    const [cat, label] = key.split('|||');
    const uniqueCount = Object.keys(valueCounts).length;

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${cat} / ${label} (${uniqueCount} значень)... `);

    let result;
    if (cache[key]) {
      result = cache[key];
      cacheHits++;
      process.stdout.write('(кеш)\n');
    } else {
      try {
        result = await askClaude(cat, label, valueCounts);
        cache[key] = result;
        saveCache(cache);
        process.stdout.write('✓\n');
        // Пауза щоб не спамити API
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        process.stdout.write(`❌ ${err.message}\n`);
        continue;
      }
    }

    // Застосовуємо mapping до конкретних записів
    const mapping = result.mapping ?? {};
    for (const c of allChars) {
      const cCat = catBySku[c.product_sku] ?? '';
      if (cCat !== cat || c.label !== label) continue;
      if (mapping[c.value] === undefined) continue;
      const newVal = mapping[c.value]; // null = видалити
      fullMapping[c.id] = { id: c.id, sku: c.product_sku, label: c.label, oldVal: c.value, newVal };
    }
  }

  console.log(`\nКеш-попадань: ${cacheHits}/${toProcess.length}`);

  const toUpdate = Object.values(fullMapping).filter(m => m.newVal !== null && m.newVal !== m.oldVal);
  const toDelete = Object.values(fullMapping).filter(m => m.newVal === null);

  console.log(`\nЗмін:   ${toUpdate.length}`);
  console.log(`Видалень: ${toDelete.length}`);

  if (DRY_RUN) {
    console.log('\n── Приклади змін ──');
    toUpdate.slice(0, 30).forEach(u =>
      console.log(`  [${u.sku}] ${u.label}: "${u.oldVal}" → "${u.newVal}"`)
    );
    console.log('\n── Приклади видалень ──');
    toDelete.slice(0, 15).forEach(d =>
      console.log(`  [${d.sku}] ${d.label}: "${d.oldVal}"`)
    );
    console.log('\n🔍 DRY RUN — дані не змінено.\n');
    return;
  }

  // 5. Застосовуємо
  if (toDelete.length > 0) {
    console.log('\n🗑  Видаляю...');
    const ids = toDelete.map(d => d.id);
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await supabase.from('product_characteristics').delete().in('id', ids.slice(i, i + 500));
      if (error) console.error('❌', error.message);
    }
    console.log(`   ${toDelete.length} ✓`);
  }

  if (toUpdate.length > 0) {
    console.log('✏️  Оновлюю...');
    let done = 0;
    for (const u of toUpdate) {
      const { error } = await supabase.from('product_characteristics').update({ value: u.newVal }).eq('id', u.id);
      if (error) console.error(`❌ [${u.sku}] ${u.label}:`, error.message);
      else { done++; if (done % 50 === 0) process.stdout.write(`\r   ${done}/${toUpdate.length}`); }
    }
    console.log(`\r   ${done}/${toUpdate.length} ✓`);
  }

  console.log('\n✅ Готово!\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
