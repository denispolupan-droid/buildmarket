// Переклад збагачених описів + FAQ на російську (backlog після mass-enrich-seo).
// Відновлюваний: обробляє тільки товари, де укр опис довгий (>=800 симв),
// а рос. версія відсутня/коротка або FAQ без перекладу.
// Запуск: npx tsx --env-file=.env.local scripts/supabase/translate-enriched-ru.mts [--limit N]
import { createClient } from '@supabase/supabase-js';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const enricher = await import(pathToFileURL(path.resolve('lib/catalog-enricher.ts')).href) as
  typeof import('../../lib/catalog-enricher');
const { translateEnrichment } = enricher;

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

const { data: products, error } = await supabase
  .from('products')
  .select('sku, description_full, description_full_ru')
  .eq('is_active', true)
  .order('sort_order');
if (error) throw error;

// Supabase обрізає вибірку до 1000 рядків — тягнемо FAQ посторінково
type FaqRow = { id: number; product_sku: string; question: string; answer: string; question_ru: string | null; sort_order: number };
const faqRows: FaqRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error: faqErr } = await supabase
    .from('product_faq')
    .select('id, product_sku, question, answer, question_ru, sort_order')
    .order('id')
    .range(from, from + 999);
  if (faqErr) throw faqErr;
  faqRows.push(...(data ?? []) as FaqRow[]);
  if (!data || data.length < 1000) break;
}
faqRows.sort((a, b) => a.sort_order - b.sort_order);

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

// Дешевий шлях: якщо рос. опис уже свіжий, перекладаємо ТІЛЬКИ FAQ (haiku, малий вихід)
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
const FAQ_ONLY_SCHEMA = {
  type: 'object' as const,
  properties: {
    faq_ru: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['faq_ru'],
  additionalProperties: false,
};

async function translateFaqOnly(faq: { q: string; a: string }[]): Promise<{ q: string; a: string }[]> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    output_config: { format: { type: 'json_schema', schema: FAQ_ONLY_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Переведи FAQ о товаре с украинского на русский (аудитория — русскоязычные покупатели в Украине). Бренды, артикулы и числа не меняй. Количество пар не меняй.

FAQ:
${faq.map((f, i) => `${i + 1}. Q: ${f.q}\n   A: ${f.a}`).join('\n')}`,
    }],
  });
  if (message.stop_reason !== 'end_turn') throw new Error(`faq translate stop_reason=${message.stop_reason}`);
  const block = message.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('faq translate: no text block');
  const parsed = JSON.parse(block.text) as { faq_ru: { q: string; a: string }[] };
  if (parsed.faq_ru.length !== faq.length) throw new Error(`faq count mismatch ${parsed.faq_ru.length} != ${faq.length}`);
  return parsed.faq_ru;
}

async function worker(): Promise<void> {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) return;
    try {
      const faq = faqBySku.get(p.sku) ?? [];
      const ruDescFresh = (p.description_full_ru ?? '').length >= ENRICHED_CHARS;
      let faqRu: { q: string; a: string }[];

      if (ruDescFresh) {
        faqRu = faq.length ? await translateFaqOnly(faq.map(f => ({ q: f.question, a: f.answer }))) : [];
      } else {
        const ru = await translateEnrichment(
          p.description_full!,
          faq.map(f => ({ q: f.question, a: f.answer })),
        );
        faqRu = ru.faq_ru;
        const { error: upErr } = await supabase
          .from('products')
          .update({ description_full_ru: ru.description_full_ru })
          .eq('sku', p.sku);
        if (upErr) throw upErr;
      }

      for (let i = 0; i < faq.length; i++) {
        const { error: fErr } = await supabase
          .from('product_faq')
          .update({ question_ru: faqRu[i].q, answer_ru: faqRu[i].a })
          .eq('id', faq[i].id);
        if (fErr) throw fErr;
      }
      ok++;
      log(`OK ${p.sku} faq=${faq.length}${ruDescFresh ? ' (faq-only)' : ''} [${ok + failed}/${total}]`);
    } catch (err) {
      failed++;
      log(`FAIL ${p.sku}: ${String(err).slice(0, 200)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
log(`DONE ok=${ok} failed=${failed}`);
