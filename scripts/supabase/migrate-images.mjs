/**
 * migrate-images.mjs
 * Завантажує фото з зовнішніх URL (Prom.ua тощо) і заливає в Supabase Storage.
 * Оновлює поле image в таблиці products.
 *
 * Запуск (dry-run):
 *   node scripts/supabase/migrate-images.mjs --dry-run
 * Реальний запуск:
 *   node scripts/supabase/migrate-images.mjs
 * Тільки певний бренд:
 *   node scripts/supabase/migrate-images.mjs --brand=Lacrysil
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN  = process.argv.includes('--dry-run');
const BRAND    = process.argv.find(a => a.startsWith('--brand='))?.slice(8);
const BUCKET   = 'products';
const DELAY_MS = 300; // пауза між завантаженнями

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ext(url) {
  const m = url.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace('jpeg','jpg') : 'jpg';
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; buildmarket-bot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log('\n🖼  Міграція фото в Supabase Storage');
  if (DRY_RUN) console.log('🔍 DRY RUN\n');
  if (BRAND)   console.log(`🔎 Тільки бренд: ${BRAND}\n`);

  // Завантажуємо товари з зовнішніми URL
  let query = supabase
    .from('products')
    .select('sku, name, brand, category_slug, image')
    .eq('is_active', true)
    .not('image', 'is', null)
    .not('image', 'like', `%${env['NEXT_PUBLIC_SUPABASE_URL']}%`); // вже в Supabase

  if (BRAND) query = query.eq('brand', BRAND);

  const { data: products, error } = await query;
  if (error) { console.error('❌', error.message); process.exit(1); }

  const toMigrate = (products ?? []).filter(p =>
    p.image &&
    (p.image.startsWith('http://') || p.image.startsWith('https://')) &&
    !p.image.includes('supabase')
  );

  console.log(`Знайдено товарів з зовнішнім фото: ${toMigrate.length}\n`);

  if (DRY_RUN) {
    toMigrate.slice(0, 10).forEach(p =>
      console.log(`  ${p.sku.padEnd(12)} ${p.brand.padEnd(12)} ${p.image?.slice(0,60)}`)
    );
    if (toMigrate.length > 10) console.log(`  ... і ще ${toMigrate.length - 10}`);
    console.log('\n✅ DRY RUN завершено.');
    return;
  }

  let ok = 0, fail = 0;

  for (const p of toMigrate) {
    const url = p.image;
    const extension = ext(url);
    // Шлях: brand/sku.jpg
    const brand    = (p.brand ?? 'other').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filePath = `${brand}/${p.sku}.${extension}`;

    try {
      const buffer = await downloadImage(url);

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
          contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
          upsert: true,
        });

      if (uploadErr) throw new Error(uploadErr.message);

      // Публічний URL
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

      // Оновлюємо в БД
      await supabase.from('products').update({ image: publicUrl }).eq('sku', p.sku);

      ok++;
      process.stdout.write(`\r  ✅ ${ok}/${toMigrate.length} — ${p.sku}          `);
    } catch (e) {
      fail++;
      console.log(`\n  ❌ ${p.sku}: ${e.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n\n📊 Результат:`);
  console.log(`   Успішно:  ${ok}`);
  console.log(`   Помилки:  ${fail}`);
  console.log('\n✅ Міграцію завершено!\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
