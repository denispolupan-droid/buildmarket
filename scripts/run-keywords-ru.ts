/**
 * Генерація російських ключових слів для товарів.
 * Використання: npx tsx --env-file=.env.local scripts/run-keywords-ru.ts [--force] [limit] [offset] [category]
 *
 * Приклади:
 *   npx tsx --env-file=.env.local scripts/run-keywords-ru.ts 10
 *   npx tsx --env-file=.env.local scripts/run-keywords-ru.ts --force 999
 *   npx tsx --env-file=.env.local scripts/run-keywords-ru.ts --force 150 646
 *   npx tsx --env-file=.env.local scripts/run-keywords-ru.ts --force 50 0 vodoemiulsiyni-interierni
 *
 * --force:  перезаписати ВСІ товари, не тільки з поганими ключовими словами
 * limit:    кількість товарів (default 20)
 * offset:   пропустити перших N товарів у сортованому списку (default 0)
 * category: фільтр по category_slug
 */

import { enrichKeywordsRu } from '../lib/keywords-ru-enricher';

const args = process.argv.slice(2);
const force    = args.includes('--force');
const rest     = args.filter(a => a !== '--force');
const limit    = Number(rest[0] ?? 20);
const offset   = Number(rest[1] ?? 0);
const category = rest[2];

console.log(`\n🔑 Генерація російських ключових слів`);
console.log(`   Режим:  ${force ? '⚡ FORCE — всі товари' : 'тільки з поганими ключовими словами'}`);
console.log(`   Ліміт: ${limit} товарів, offset: ${offset}${category ? ` | Категорія: ${category}` : ''}\n`);

async function main() {
  for await (const event of enrichKeywordsRu({ limit, offset, category, force })) {
    if (event.type === 'start') {
      if (event.total === 0) { console.log('✅ Нічого для обробки.'); process.exit(0); }
      console.log(`📦 Знайдено ${event.total} товарів\n`);

    } else if (event.type === 'progress') {
      process.stdout.write(`[${event.done + 1}/${event.total}] ${event.sku} — ${event.name.slice(0, 55)}\n`);

    } else if (event.type === 'result') {
      console.log(`  ✓ ${event.keywords_ru.slice(0, 110)}\n`);

    } else if (event.type === 'error') {
      console.log(`  ✗ Помилка: ${event.error}\n`);

    } else if (event.type === 'done') {
      console.log(`\n✅ Готово: ${event.done} оновлено, ${event.errors} помилок`);
    }
  }
}

main();
