/**
 * Применяет миграции учётной системы (008–011) к Supabase.
 *
 * Требования:
 *   SUPABASE_DB_URL в .env.local — PostgreSQL connection string
 *   (Supabase Dashboard → Settings → Database → Connection string → URI)
 *
 * Запуск:
 *   node --env-file=.env.local scripts/apply-accounting-migrations.mjs
 *
 * Флаги:
 *   --dry-run   только проверить SQL, не применять
 *   --from=009  начать с конкретной миграции
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const root   = join(__dir, '..');
const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromMig = args.find(a => a.startsWith('--from='))?.split('=')[1];

const MIGRATIONS = [
  '008_accounting_core.sql',
  '009_channels_marketplaces.sql',
  '010_customers_webhooks_promo.sql',
  '011_uom_prices_currency.sql',
];

// ── Проверка переменных окружения ─────────────────────────────────────────────

if (!process.env.SUPABASE_DB_URL) {
  console.error(`
❌  SUPABASE_DB_URL не задан в .env.local

Как получить:
  1. Supabase Dashboard → ваш проект
  2. Settings → Database
  3. Connection string → URI
  4. Скопировать строку вида:
     postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

Добавить в .env.local:
  SUPABASE_DB_URL=postgresql://postgres...
`);
  process.exit(1);
}

// ── Проверка наличия пакета postgres ──────────────────────────────────────────

let sql;
try {
  const { default: postgres } = await import('postgres');
  sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require',
    max: 1,
    idle_timeout: 30,
    connect_timeout: 15,
  });
} catch {
  console.error(`
❌  Пакет 'postgres' не установлен.

Установить:
  npm install -D postgres

Затем повторить запуск.
`);
  process.exit(1);
}

// ── Применение миграций ───────────────────────────────────────────────────────

const migrDir = join(root, 'supabase', 'migrations');
let startIdx  = 0;

if (fromMig) {
  startIdx = MIGRATIONS.findIndex(m => m.startsWith(fromMig));
  if (startIdx === -1) {
    console.error(`❌  Миграция '${fromMig}' не найдена`);
    process.exit(1);
  }
}

const toApply = MIGRATIONS.slice(startIdx);

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Применение миграций учётной системы`);
if (dryRun) console.log('  РЕЖИМ DRY-RUN — изменения не применяются');
console.log(`${'═'.repeat(60)}\n`);

let applied = 0;
let failed  = 0;

for (const filename of toApply) {
  const filepath = join(migrDir, filename);

  if (!existsSync(filepath)) {
    console.warn(`⚠️  Файл не найден, пропускаем: ${filename}`);
    continue;
  }

  const content = readFileSync(filepath, 'utf-8');
  const name    = filename.replace('.sql', '');

  process.stdout.write(`▶  ${name} ...`);

  if (dryRun) {
    console.log(' пропущен (dry-run)');
    continue;
  }

  try {
    // Каждую миграцию выполняем в транзакции
    await sql.begin(async tx => {
      await tx.unsafe(content);
    });
    console.log(' ✓');
    applied++;
  } catch (err) {
    console.log(' ✗');
    console.error(`\n   Ошибка в ${filename}:`);
    console.error(`   ${err.message}\n`);
    failed++;

    // Спрашиваем продолжать ли
    if (toApply.indexOf(filename) < toApply.length - 1) {
      console.error('   Следующие миграции могут зависеть от этой.');
      console.error('   Исправьте ошибку и повторите с флагом --from=' + filename.slice(0, 3));
      break;
    }
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`  Применено: ${applied}  |  Ошибок: ${failed}`);
console.log(`${'─'.repeat(60)}\n`);

await sql.end();
process.exit(failed > 0 ? 1 : 0);
