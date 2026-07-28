// Разове копіювання КАТАЛОЖНИХ даних prod → test для перевірки на localhost.
// Prod — тільки читання. Test: каталожні таблиці чистяться і заливаються заново.
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const prodEnv = loadEnv('.env.local');
const testEnv = loadEnv('.env.test');
const prod = createClient(prodEnv.NEXT_PUBLIC_SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY);
const test = createClient(testEnv.NEXT_PUBLIC_SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY);

if (!testEnv.NEXT_PUBLIC_SUPABASE_URL.includes('mdrextghmuzkyelpqsgp')) {
  throw new Error('Захист: .env.test не вказує на test-проєкт');
}

async function fetchAll(client, table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table} read: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function wipe(table, col) {
  const { error } = await test.from(table).delete().not(col, 'is', null);
  if (error) throw new Error(`${table} wipe: ${error.message}`);
}

async function replaceChunks(table, rows, chunk = 300) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await test.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table} insert @${i}: ${error.message}`);
  }
}

async function main() {
  console.log('Читаю prod...');
  const [categories, products, stock, chars, faq] = await Promise.all([
    fetchAll(prod, 'categories'),
    fetchAll(prod, 'products'),
    fetchAll(prod, 'product_stock'),
    fetchAll(prod, 'product_characteristics'),
    fetchAll(prod, 'product_faq'),
  ]);
  console.log(`categories=${categories.length} products=${products.length} stock=${stock.length} chars=${chars.length} faq=${faq.length}`);

  console.log('Чищу test (каталожні таблиці, у зворотному FK-порядку)...');
  await wipe('product_faq', 'product_sku');
  await wipe('product_characteristics', 'product_sku');
  await wipe('product_stock', 'sku');
  await wipe('products', 'sku');
  await wipe('categories', 'slug');

  console.log('Заливаю test...');
  await replaceChunks('categories', categories);
  await replaceChunks('products', products);
  await replaceChunks('product_stock', stock);
  await replaceChunks('product_characteristics', chars);
  await replaceChunks('product_faq', faq);
  console.log('✅ Готово');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
