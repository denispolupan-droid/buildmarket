/**
 * Запуск агента збагачення каталогу.
 * Використання: npx tsx --env-file=.env.local scripts/run-enricher.mts [limit] [category]
 *
 * Приклади:
 *   npx tsx --env-file=.env.local scripts/run-enricher.mts 10
 *   npx tsx --env-file=.env.local scripts/run-enricher.mts 5 vodoemiulsiyni-interierni
 */

import { enrichCatalog } from '../lib/catalog-enricher';

const limit    = Number(process.argv[2] ?? 10);
const category = process.argv[3];

console.log(`\n🤖 Агент збагачення каталогу`);
console.log(`   Ліміт: ${limit} товарів${category ? ` | Категорія: ${category}` : ''}\n`);

let done = 0;
let errors = 0;

for await (const event of enrichCatalog({ limit, category })) {
  if (event.type === 'start') {
    if (event.total === 0) { console.log('✅ Всі товари вже мають опис.'); process.exit(0); }
    console.log(`📦 Знайдено ${event.total} товарів без опису\n`);

  } else if (event.type === 'progress') {
    process.stdout.write(`[${event.done + 1}/${event.total}] ${event.sku} — ${event.name.slice(0, 60)}...\n`);

  } else if (event.type === 'result') {
    console.log(`  ✓ ${event.description_full.slice(0, 120)}...\n`);
    done++;

  } else if (event.type === 'error') {
    console.log(`  ✗ Помилка: ${event.error}\n`);
    errors++;

  } else if (event.type === 'done') {
    console.log(`\n✅ Готово: ${event.done} описів згенеровано, ${event.errors} помилок`);
  }
}
