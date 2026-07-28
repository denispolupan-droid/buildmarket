/**
 * Обкладинки для статей, у яких їх ще немає — обома мовами.
 *
 * generate-blog-covers.mjs має захардкожений список статей і не пише в БД, тому
 * кожна нова стаття лишалася без заставки (реальний випадок: «Нить для труб»).
 * Цей скрипт бере статті з blog_posts, де image порожній, малює {slug}.png та
 * {slug}-ru.png у тому самому дизайні й проставляє шляхи в image / image_ru.
 *
 * Палітра обирається детерміновано за слагом — та сама стаття завжди отримує
 * ті самі кольори, а сусідні статті в списку не зливаються в одну пляму.
 *
 * Запуск:  node --env-file=.env.local scripts/generate-blog-covers-missing.mjs
 *          node --env-file=.env.local scripts/generate-blog-covers-missing.mjs --slug=my-article
 *          (--force — перемалювати навіть якщо обкладинка вже є)
 *
 * PNG лежать у public/ і віддаються статикою, тож після прогону їх треба
 * закомітити — без деплою нові файли на сайті не з'являться.
 */
import sharp from 'sharp';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const OUT = 'public/blog/covers';
fs.mkdirSync(OUT, { recursive: true });
const logoB64 = 'data:image/svg+xml;base64,' + fs.readFileSync('public/fixline-logo-white.svg').toString('base64');

const args = process.argv.slice(2);
const onlySlug = args.find(a => a.startsWith('--slug='))?.slice(7);
const force = args.includes('--force');

// Ті самі поєднання, що в першій партії — щоб нові статті не вибивалися зі стилю
const PALETTES = [
  { color1: '#1E293B', color2: '#1e3a5f', accent: '#60A5FA' },
  { color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  { color1: '#1a2e1a', color2: '#1e3b2e', accent: '#4ADE80' },
  { color1: '#2d1b4e', color2: '#1e293b', accent: '#C084FC' },
  { color1: '#2d2416', color2: '#3b2e1a', accent: '#FCD34D' },
  { color1: '#2d1a1a', color2: '#3b2020', accent: '#F87171' },
  { color1: '#1e2926', color2: '#1a3530', accent: '#34D399' },
  { color1: '#1E293B', color2: '#2d3748', accent: '#818CF8' },
];

/** Стабільний вибір палітри за слагом — без випадковості між прогонами. */
function paletteFor(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function splitLines(text, maxLen) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

function coverSvg({ title, category, color1, color2, accent }) {
  const lines = splitLines(title, 36);
  const lineH = 56;
  const titleY = 315 - (lines.length * lineH) / 2 + 40;
  const tspans = lines.map((line, i) => `<tspan x="600" dy="${i === 0 ? 0 : lineH}">${esc(line)}</tspan>`).join('');
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <circle cx="1050" cy="120" r="180" fill="${accent}" opacity="0.06"/>
  <circle cx="150" cy="520" r="120" fill="${accent}" opacity="0.05"/>
  <rect x="0" y="0" width="6" height="630" fill="${accent}" opacity="0.8"/>
  <rect x="60" y="60" width="120" height="34" rx="17" fill="${accent}" opacity="0.18"/>
  <rect x="60" y="60" width="120" height="34" rx="17" fill="none" stroke="${accent}" stroke-width="1" opacity="0.5"/>
  <text x="120" y="82" font-family="Arial" font-size="14" font-weight="bold" fill="${accent}" text-anchor="middle">${esc(category)}</text>
  <text x="600" y="${titleY}" font-family="Arial" font-size="46" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${tspans}</text>
  <rect x="60" y="510" width="1080" height="1" fill="rgba(255,255,255,0.1)"/>
  <image href="${logoB64}" x="60" y="528" width="220" height="50"/>
  <text x="1140" y="556" font-family="Arial" font-size="15" fill="rgba(255,255,255,0.3)" text-anchor="end">fixline.com.ua</text>
</svg>`;
}

let query = supabase
  .from('blog_posts')
  .select('id, slug, title, title_ru, category, category_ru, image, image_ru');
if (onlySlug) query = query.eq('slug', onlySlug);
else if (!force) query = query.is('image', null);

const { data: posts, error } = await query;
if (error) throw error;
if (!posts?.length) { console.log('Статей без обкладинки немає.'); process.exit(0); }

let ok = 0;
for (const p of posts) {
  const palette = paletteFor(p.slug);
  const update = {};

  const uaPath = `/blog/covers/${p.slug}.png`;
  await sharp(Buffer.from(coverSvg({
    title: p.title, category: p.category || 'Поради', ...palette,
  }))).png().toFile('public' + uaPath);
  update.image = uaPath;

  if (p.title_ru) {
    const ruPath = `/blog/covers/${p.slug}-ru.png`;
    await sharp(Buffer.from(coverSvg({
      title: p.title_ru, category: p.category_ru || 'Советы', ...palette,
    }))).png().toFile('public' + ruPath);
    update.image_ru = ruPath;
  }

  const { error: upErr } = await supabase.from('blog_posts').update(update).eq('id', p.id);
  if (upErr) { console.error('✗ db:', p.slug, upErr.message); continue; }
  console.log(`✓ ${p.slug}${update.image_ru ? ' (+ru)' : ' (без рос. заголовка)'}`);
  ok++;
}
console.log(`\nГотово: ${ok}. Не забудьте закомітити PNG з public/blog/covers/`);
