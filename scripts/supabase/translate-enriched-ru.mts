// Переклад збагачених описів + FAQ на російську (backlog після mass-enrich-seo).
// Відновлюваний: обробляє тільки товари, де укр опис довгий (>=800 симв),
// а рос. версія відсутня/коротка або FAQ без перекладу.
// Запуск: npx tsx --env-file=.env.local scripts/supabase/translate-enriched-ru.mts [--limit N]
import { createClient } from '@supabase/supabase-js';
import { appendFileSync } from 'node:fs';
import { translateEnrichment } from '../../lib/catalog-enricher';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ENRICHED_CHARS = 800;
const CONCURRENCY = 6;
const PROGRESS_FILE = 'scripts/supabase/translate-ru-progress.log';

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;

function log(line: string) {
  appendFileSync(PROGRESS_FILE, `${new Date().toISOString()} ${line}\n`);
  console.log(line);
}

const [{ data: products, error }, { data: faqRows, error: faqErr }] = await Promise.all([
  supabase
    .from('products')
    .select('sku, description_full, description_full_ru')
    .eq('is_active', true)
    .order('sort_order'),
  supabase.from('product_faq').select('id, product_sku, question, answer, question_ru, sort_order').order('sort_order'),
]);
if (error) throw error;
if (faqErr) throw faqErr;

const faqBySku = new Map<string, { id: number; question: string; answer: string; question_ru: string | null }[]>();
for (const row of faqRows ?? []) {
  const list = faqBySku.get(row.product_sku) ?? [];
  list.push(row);
  faqBySku.set(row.product_sku, list);
}

let queue = (products ?? []).filter(p => {
  const enriched = (p.description_full ?? '').length >= ENRICHED_CHARS;
  if (!enriched) return false;
  const ruStale = (p.description_full_ru ?? '').length < ENRICHED_CHARS;
  const faqUntranslated = (faqBySku.get(p.sku) ?? []).some(f => !f.question_ru);
  return ruStale || faqUntranslated;
});
if (LIMIT) queue = queue.slice(0, LIMIT);

log(`START pending=${queue.length} concurrency=${CONCURRENCY}`);
let ok = 0, failed = 0;
const total = queue.length;

async function worker(): Promise<void> {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) return;
    try {
      const faq = faqBySku.get(p.sku) ?? [];
      const ru = await translateEnrichment(
        p.description_full!,
        faq.map(f => ({ q: f.question, a: f.answer })),
      );

      const { error: upErr } = await supabase
        .from('products')
        .update({ description_full_ru: ru.description_full_ru })
        .eq('sku', p.sku);
      if (upErr) throw upErr;

      for (let i = 0; i < faq.length; i++) {
        const { error: fErr } = await supabase
          .from('product_faq')
          .update({ question_ru: ru.faq_ru[i].q, answer_ru: ru.faq_ru[i].a })
          .eq('id', faq[i].id);
        if (fErr) throw fErr;
      }
      ok++;
      log(`OK ${p.sku} faq=${faq.length} [${ok + failed}/${total}]`);
    } catch (err) {
      failed++;
      log(`FAIL ${p.sku}: ${String(err).slice(0, 200)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
log(`DONE ok=${ok} failed=${failed}`);
