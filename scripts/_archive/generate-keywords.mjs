/**
 * Generates Ukrainian search keywords for all products using Claude API.
 * Updates products.keywords in DB.
 *
 * Usage: node scripts/generate-keywords.mjs
 */
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const claude   = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

// ── Fetch all products with characteristics ───────────────────────────────────

const { data: products } = await supabase
  .from('products')
  .select('sku, name, brand, volume, category_slug, description')
  .eq('is_active', true)
  .is('keywords', null)   // only products without keywords yet
  .order('sku');

const { data: characteristics } = await supabase
  .from('product_characteristics')
  .select('product_sku, label, value')
  .order('sort_order');

const charsMap = new Map();
for (const c of (characteristics ?? [])) {
  if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
  charsMap.get(c.product_sku).push(`${c.label}: ${c.value}`);
}

const { data: categories } = await supabase.from('categories').select('slug, name');
const catNameMap = new Map(categories?.map(c => [c.slug, c.name]) ?? []);

console.log(`\nGenerating keywords for ${products?.length ?? 0} products...\n`);

// ── Process in batches of 10 (Claude handles 10 products at a time) ───────────

const BATCH = 10;
let done = 0;
let errors = 0;

for (let i = 0; i < (products?.length ?? 0); i += BATCH) {
  const batch = products.slice(i, i + BATCH);

  const productLines = batch.map((p, idx) => {
    const chars = charsMap.get(p.sku) ?? [];
    const catName = catNameMap.get(p.category_slug) ?? p.category_slug ?? '';
    return `${idx + 1}. SKU:${p.sku} | ${p.brand} ${p.name}${p.volume ? ' ' + p.volume : ''} | Категорія: ${catName}${chars.length ? ' | ' + chars.slice(0, 4).join(', ') : ''}`;
  }).join('\n');

  const prompt = `Ти SEO-спеціаліст для українського будівельного маркетплейсу.
Для кожного товару згенеруй 6-8 пошукових запитів українською мовою — через кому.
Запити мають бути: назва товару, синоніми, область застосування, популярні варіанти пошуку.
НЕ включай бренд у кожен запит (він вже є в назві товару).
Відповідай ТІЛЬКИ у форматі: номер. запити через кому

Товари:
${productLines}`;

  try {
    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const lines = text.trim().split('\n').filter(l => l.trim());

    for (let j = 0; j < batch.length; j++) {
      const p    = batch[j];
      const line = lines.find(l => l.startsWith(`${j + 1}.`));
      if (!line) { errors++; continue; }

      const keywords = line.replace(/^\d+\.\s*/, '').trim();
      if (!keywords) { errors++; continue; }

      const { error } = await supabase
        .from('products')
        .update({ keywords })
        .eq('sku', p.sku);

      if (error) {
        console.log(`  ✗ ${p.sku}: ${error.message}`);
        errors++;
      } else {
        process.stdout.write('.');
        done++;
      }
    }
  } catch (err) {
    console.log(`\n  Batch error: ${err.message}`);
    errors += batch.length;
  }

  // Throttle
  if (i + BATCH < (products?.length ?? 0)) {
    await new Promise(r => setTimeout(r, 1000));
  }
}

console.log(`\n\n=== DONE ===`);
console.log(`✅ Generated: ${done}`);
console.log(`✗  Errors:    ${errors}`);
