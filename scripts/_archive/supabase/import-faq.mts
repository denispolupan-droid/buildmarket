// Імпорт FAQ, згенерованих mass-enrich-seo.mts, з faq-generated.jsonl у product_faq.
// Ідемпотентний: перезаписує FAQ товару (delete + insert).
// Запуск: npx tsx --env-file=.env.local scripts/supabase/import-faq.mts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const lines = readFileSync('scripts/supabase/faq-generated.jsonl', 'utf8').split('\n').filter(Boolean);
// Останній запис для SKU перемагає (на випадок повторної генерації)
const bySku = new Map<string, { q: string; a: string }[]>();
for (const line of lines) {
  const { sku, faq } = JSON.parse(line) as { sku: string; faq: { q: string; a: string }[] };
  bySku.set(sku, faq);
}

console.log(`Importing FAQ for ${bySku.size} products...`);
let ok = 0, failed = 0;
for (const [sku, faq] of bySku) {
  const { error: delErr } = await supabase.from('product_faq').delete().eq('product_sku', sku);
  if (delErr) { console.error(`DEL ${sku}: ${delErr.message}`); failed++; continue; }
  const { error: insErr } = await supabase.from('product_faq').insert(
    faq.map((f, i) => ({ product_sku: sku, question: f.q, answer: f.a, sort_order: i })),
  );
  if (insErr) { console.error(`INS ${sku}: ${insErr.message}`); failed++; continue; }
  ok++;
}
console.log(`DONE ok=${ok} failed=${failed}`);
