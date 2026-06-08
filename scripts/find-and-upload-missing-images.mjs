/**
 * Finds product images for SKUs without photos by searching brand websites + Rozetka,
 * downloads them, uploads to Supabase storage, and updates the products table.
 *
 * Usage: node scripts/find-and-upload-missing-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
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
const BUCKET = 'products';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,ru;q=0.8',
};

// ── Image search strategies ───────────────────────────────────────────────────

/** Extract og:image from any page */
async function ogImage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Search Rozetka and return first product image URL */
async function searchRozetka(query) {
  try {
    const url = `https://rozetka.com.ua/ua/search/?text=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract image from first product card
    // Look for "src":"https://content1.rozetka.com.ua/goods/images/big/..."
    const imgMatch = html.match(/https:\/\/content[0-9]\.rozetka\.com\.ua\/goods\/images\/big\/[^"']+/);
    if (imgMatch) return imgMatch[0];

    // Try OG image of first product link
    const linkMatch = html.match(/href="(https:\/\/rozetka\.com\.ua\/ua\/[^"]+\/p[0-9]+\/)"/);
    if (linkMatch) return await ogImage(linkMatch[1]);

    return null;
  } catch { return null; }
}

/** Search Epicentr and return first product image */
async function searchEpicentr(query) {
  try {
    const url = `https://epicentrk.ua/search/?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/https:\/\/[^"']+epicentrk[^"']+\.(?:jpg|jpeg|png|webp)/i);
    return m ? m[0] : null;
  } catch { return null; }
}

/** Try brand-specific URLs */
async function brandSearch(brand, name, sku) {
  const brandLower = brand.toLowerCase();
  const shortName  = name.split(',')[0].trim();

  const strategies = {
    'polifarb': [
      `https://polifarb.com.ua/ua/?s=${encodeURIComponent(shortName)}`,
    ],
    'siltek': [
      `https://siltek.com.ua/ua/search?query=${encodeURIComponent(shortName)}`,
      `https://siltek.ua/search?query=${encodeURIComponent(shortName)}`,
    ],
    'lacrysil': [
      `https://lacrysil.com.ua/?s=${encodeURIComponent(shortName)}`,
    ],
    'ceresit': [
      `https://www.ceresit.ua/ua/search/?q=${encodeURIComponent(shortName)}`,
    ],
    'lotus': [
      `https://lotusua.com/search/?search=${encodeURIComponent(shortName)}`,
    ],
    'knauf': [
      `https://knauf.ua/ua/search?q=${encodeURIComponent(shortName)}`,
    ],
  };

  const urls = strategies[brandLower] ?? [];
  for (const url of urls) {
    const img = await ogImage(url);
    if (img && img.startsWith('http')) return img;
  }
  return null;
}

// ── Download + Upload ─────────────────────────────────────────────────────────

async function downloadImage(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? 'png'
             : contentType.includes('webp') ? 'webp'
             : 'jpg';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error('Image too small (likely placeholder)');
  return { buf, ext };
}

async function uploadToSupabase(buf, ext, sku, brand) {
  const brandSlug = brand.toLowerCase()
    .replace(/[^a-zа-яіїєё0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const filePath = `${brandSlug}/${sku}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buf, { contentType: `image/${ext}`, upsert: true });

  if (error) throw error;
  return filePath;
}

async function updateProduct(sku, filePath) {
  const { error } = await supabase
    .from('products')
    .update({ image: `/img/${filePath}` })
    .eq('sku', sku);
  if (error) throw error;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const { data: products } = await supabase
  .from('products')
  .select('sku, name, brand, volume')
  .is('image', null)
  .eq('is_active', true)
  .order('brand');

console.log(`\nFound ${products.length} products without images\n`);

const results = { ok: [], notFound: [], error: [] };

for (const p of products) {
  const query = `${p.brand} ${p.name.split(',')[0]}`.trim();
  process.stdout.write(`[${p.sku}] ${p.brand} — ${p.name.slice(0, 40)}... `);

  let imageUrl = null;

  // 1. Try brand website
  imageUrl = await brandSearch(p.brand, p.name, p.sku);

  // 2. Try Rozetka search
  if (!imageUrl) {
    imageUrl = await searchRozetka(query);
  }

  // 3. Try Epicentr
  if (!imageUrl) {
    imageUrl = await searchEpicentr(query);
  }

  if (!imageUrl) {
    console.log('❌ не знайдено');
    results.notFound.push(p.sku);
    continue;
  }

  // Download + upload
  try {
    const { buf, ext } = await downloadImage(imageUrl);
    const filePath = await uploadToSupabase(buf, ext, p.sku, p.brand);
    await updateProduct(p.sku, filePath);
    console.log(`✅ ${filePath} (${Math.round(buf.length / 1024)}KB)`);
    results.ok.push(p.sku);
  } catch (err) {
    console.log(`⚠️  помилка завантаження: ${err.message}`);
    results.error.push({ sku: p.sku, url: imageUrl, err: err.message });
  }

  // Small delay to avoid rate limiting
  await new Promise(r => setTimeout(r, 500));
}

console.log('\n=== РЕЗУЛЬТАТ ===');
console.log(`✅ Знайдено і завантажено: ${results.ok.length}`);
console.log(`❌ Не знайдено: ${results.notFound.length}  → ${results.notFound.join(', ')}`);
console.log(`⚠️  Помилка завантаження: ${results.error.length}`);
if (results.error.length) {
  results.error.forEach(e => console.log(`   ${e.sku}: ${e.err} — ${e.url}`));
}
