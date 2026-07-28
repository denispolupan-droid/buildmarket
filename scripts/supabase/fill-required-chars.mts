// Дозаповнення ОБОВ'ЯЗКОВИХ характеристик (за словником категорій) через той
// самий рушій, що й SEO-черга (enrichCatalog): характеристики регенеруються
// з merge (існуючі значення пріоритетні), опис чіпається лише якщо «тонкий»,
// FAQ — лише якщо немає/без перекладу.
// Перезапуск безпечний: список будується заново, оброблені товари випадають.
// Запуск: npx tsx --env-file=.env.local scripts/supabase/fill-required-chars.mts [--limit N]
import { createClient } from '@supabase/supabase-js';
import { appendFileSync } from 'node:fs';
// tsx транспілює lib/*.ts у CJS — іменовані експорти опиняються в default,
// тому дістаємо через namespace із фолбеком (tsc-сумісно)
import * as enricherNS from '../../lib/catalog-enricher';
const { enrichCatalog } =
  (((enricherNS as Record<string, unknown>).default ?? enricherNS)) as typeof enricherNS;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROGRESS_FILE = 'scripts/supabase/fill-required-progress.log';
const WORKERS = 4; // паралельні послідовні черги (як CONCURRENCY в ai-filler)

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;

function log(line: string) {
  appendFileSync(PROGRESS_FILE, `${new Date().toISOString()} ${line}\n`);
  console.log(line);
}

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

// SKU з незаповненими обов'язковими характеристиками (лейбли в БД вже канонічні)
async function findSkusMissingRequired(): Promise<string[]> {
  const [reqRows, products, chars] = await Promise.all([
    fetchAll<{ category_slug: string; characteristic_definitions: { label: string } | null }>(
      'category_characteristics', 'category_slug, required, characteristic_definitions(label)',
      q => q.eq('required', true)),
    fetchAll<{ sku: string; category_slug: string | null }>('products', 'sku, category_slug', q => q.eq('is_active', true)),
    fetchAll<{ product_sku: string; label: string }>('product_characteristics', 'product_sku, label'),
  ]);

  const reqByCat = new Map<string, string[]>();
  for (const r of reqRows) {
    if (!r.characteristic_definitions) continue;
    if (!reqByCat.has(r.category_slug)) reqByCat.set(r.category_slug, []);
    reqByCat.get(r.category_slug)!.push(r.characteristic_definitions.label);
  }
  const haveBySku = new Map<string, Set<string>>();
  for (const c of chars) {
    if (!haveBySku.has(c.product_sku)) haveBySku.set(c.product_sku, new Set());
    haveBySku.get(c.product_sku)!.add(c.label);
  }

  return products
    .filter(p => {
      const req = reqByCat.get(p.category_slug ?? '') ?? [];
      if (!req.length) return false;
      const have = haveBySku.get(p.sku) ?? new Set();
      return req.some(l => !have.has(l));
    })
    .map(p => p.sku);
}

let skus = await findSkusMissingRequired();
if (LIMIT) skus = skus.slice(0, LIMIT);
log(`START pending=${skus.length} workers=${WORKERS}`);

// Розкладаємо по воркерах через один (щоб категорії йшли впереміш — кеш лейблів спільний)
const chunks: string[][] = Array.from({ length: WORKERS }, () => []);
skus.forEach((sku, i) => chunks[i % WORKERS].push(sku));

let ok = 0, failed = 0;
async function runChunk(chunk: string[]): Promise<void> {
  if (!chunk.length) return;
  for await (const ev of enrichCatalog({ skus: chunk, limit: chunk.length })) {
    if (ev.type === 'result') { ok++; log(`OK ${ev.sku} [${ok + failed}/${skus.length}]`); }
    else if (ev.type === 'error') { failed++; log(`FAIL ${ev.sku}: ${ev.error.slice(0, 180)} [${ok + failed}/${skus.length}]`); }
  }
}

await Promise.all(chunks.map(runChunk));
log(`DONE ok=${ok} failed=${failed}`);

const left = await findSkusMissingRequired();
log(`REMAINING with missing required: ${left.length}`);
