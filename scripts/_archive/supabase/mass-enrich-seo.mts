// Масова генерація описів (Фаза 5 SEO_SPEC): 250–400 слів + FAQ.
// Промпт погоджено на 10 зразках (SEO_DESCRIPTION_SAMPLES.md, 2026-07-17).
// description_full пишеться одразу в products; FAQ — у scripts/supabase/faq-generated.jsonl
// (імпорт у product_faq окремим кроком після міграції).
// Запуск: npx tsx --env-file=.env.local scripts/supabase/mass-enrich-seo.mts [--limit N] [--dry]
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FAQ_FILE = 'scripts/supabase/faq-generated.jsonl';
const PROGRESS_FILE = 'scripts/supabase/mass-enrich-progress.log';
const CONCURRENCY = 6;

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;
const DRY = process.argv.includes('--dry');

const SCHEMA = {
  type: 'object' as const,
  properties: {
    description_full: {
      type: 'string' as const,
      description: 'Повний опис товару українською, 250–400 слів, 4–5 абзаців, розділені порожнім рядком, без markdown і заголовків',
    },
    faq: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const },
          a: { type: 'string' as const },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['description_full', 'faq'],
  additionalProperties: false,
};

type ProductRow = { sku: string; name: string; brand: string; category_slug: string | null; description: string | null; keywords: string | null };

function buildPrompt(p: ProductRow, chars: string, categoryName: string): string {
  return `Ти SEO-копірайтер українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua, доставка Новою Поштою по всій Україні).

Напиши для товару:
1. Повний опис (description_full): 250–400 слів, 4–5 абзаців у такому порядку:
   - призначення товару та ключова властивість (почни з бренду й назви);
   - сфера застосування: конкретні поверхні, типи робіт, внутрішні/зовнішні;
   - технічні характеристики своїми словами (витрата, час висихання, температура, фасовка) — ТІЛЬКИ з наданих даних, нічого не вигадуй;
   - переваги перед аналогами (без назв конкурентів);
   - умови покупки: відправка Новою Поштою по Україні (Київ, Харків, Дніпро, Одеса, Львів та ін.), оплата при отриманні або передоплата.
2. FAQ: 3–4 пари питання-відповідь під реальні пошукові запити (витрата на м², як застосовувати, чим відрізняється від схожих типів, скільки сохне). Відповіді 2–3 речення, тільки на основі наданих даних.

Вимоги до тексту:
- природна українська мова, без суржику й канцеляризмів;
- без markdown, без заголовків усередині опису;
- не перераховуй характеристики списком через кому — вплітай у речення;
- цифри з характеристик використовуй точно як надано.

Товар:
Назва: ${p.name}
Бренд: ${p.brand}
Категорія: ${categoryName}
Короткий опис: ${p.description ?? ''}
${p.keywords ? `Ключові слова: ${p.keywords}` : ''}
${chars ? `Характеристики:\n${chars}` : 'Характеристики: немає даних'}`;
}

function log(line: string) {
  const stamp = new Date().toISOString();
  appendFileSync(PROGRESS_FILE, `${stamp} ${line}\n`);
  console.log(line);
}

// Уже оброблені SKU (для безпечного перезапуску)
const doneSkus = new Set<string>();
if (existsSync(FAQ_FILE)) {
  for (const line of readFileSync(FAQ_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { doneSkus.add((JSON.parse(line) as { sku: string }).sku); } catch { /* skip */ }
  }
}

const { data: products, error } = await supabase
  .from('products')
  .select('sku, name, brand, category_slug, description, keywords')
  .eq('is_active', true)
  .order('sort_order');
if (error) throw error;

const { data: categories } = await supabase.from('categories').select('slug, name');
const catName = new Map((categories ?? []).map(c => [c.slug, c.name]));

let queue = (products ?? []).filter(p => !doneSkus.has(p.sku));
if (LIMIT) queue = queue.slice(0, LIMIT);

log(`START total=${products?.length} pending=${queue.length} done_before=${doneSkus.size} concurrency=${CONCURRENCY}${DRY ? ' DRY' : ''}`);

let ok = 0, failed = 0;

async function processOne(p: ProductRow): Promise<void> {
  const { data: chars } = await supabase
    .from('product_characteristics')
    .select('label, value')
    .eq('product_sku', p.sku);
  const charsText = (chars ?? []).map(c => `${c.label}: ${c.value}`).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(p, charsText, catName.get(p.category_slug ?? '') ?? p.category_slug ?? '') }],
  });

  if (message.stop_reason !== 'end_turn') throw new Error(`stop_reason=${message.stop_reason}`);
  const block = message.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block');
  const parsed = JSON.parse(block.text) as { description_full: string; faq: { q: string; a: string }[] };
  const words = parsed.description_full.split(/\s+/).filter(Boolean).length;
  if (words < 150) throw new Error(`too short: ${words} words`);

  if (!DRY) {
    const { error: upErr } = await supabase
      .from('products')
      .update({ description_full: parsed.description_full })
      .eq('sku', p.sku);
    if (upErr) throw upErr;
    appendFileSync(FAQ_FILE, JSON.stringify({ sku: p.sku, faq: parsed.faq }) + '\n');
  }
  ok++;
  log(`OK ${p.sku} words=${words} faq=${parsed.faq.length} [${ok + failed}/${queue.length}]`);
}

async function worker(): Promise<void> {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) return;
    try {
      await processOne(p);
    } catch (err) {
      failed++;
      log(`FAIL ${p.sku}: ${String(err).slice(0, 200)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
log(`DONE ok=${ok} failed=${failed}`);
