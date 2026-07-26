/**
 * Російські обкладинки статей блогу.
 *
 * У обкладинку вшито заголовок статті — на /ru показувати укр текст не можна.
 * Скрипт для кожної опублікованої статті з обкладинкою за конвенцією
 * /blog/covers/{slug}.png генерує {slug}-ru.png (той самий дизайн, але
 * title_ru + категорія рос.) і пише шлях у blog_posts.image_ru.
 *
 * Палітра: для слагів з першої партії — точні кольори з generate-blog-covers.mjs;
 * для решти — семплінг пікселів наявної укр обкладинки (лівий-верх = color1,
 * правий-низ = color2 з компенсацією затемнення, смуга зліва = accent).
 *
 * Запуск:  node --env-file=.env.local scripts/generate-blog-covers-ru.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const OUT = 'public/blog/covers';
const logoB64 = 'data:image/svg+xml;base64,' + fs.readFileSync('public/fixline-logo-white.svg').toString('base64');

// Точні палітри першої партії (з generate-blog-covers.mjs)
const PALETTES = {
  'gruntivscha-navishcho-i-yaku-vybrat':    { color1: '#1E293B', color2: '#1e3a5f', accent: '#60A5FA' },
  'kley-dlya-remontu-vybir':                { color1: '#1E293B', color2: '#2d3748', accent: '#60A5FA' },
  'hidroizolyatsiya-fundamentu-i-vannoyi':  { color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  'zakhyst-derevyny-antyseptyk-lak-oliya':  { color1: '#1a2e1a', color2: '#1e3b2e', accent: '#4ADE80' },
  'yak-vybrat-farbu':                       { color1: '#2d1b4e', color2: '#1e293b', accent: '#C084FC' },
  'yak-vybrat-hermetyk':                    { color1: '#1E293B', color2: '#243F6B', accent: '#60A5FA' },
  'montazhna-pina-yak-vykorystovuvaty':     { color1: '#1e2d3b', color2: '#243F6B', accent: '#FCD34D' },
  'shpaklivka-stin-startova-finishna':      { color1: '#2d2416', color2: '#3b2e1a', accent: '#FCA5A5' },
  'zatyrka-dlya-plytky':                    { color1: '#1a1e2d', color2: '#1e293b', accent: '#60A5FA' },
  'peretvoryuvach-irzhi':                   { color1: '#2d1a1a', color2: '#3b2020', accent: '#F87171' },
  'vologopoglynych':                        { color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  'plastyfikator-dlya-betonu':              { color1: '#1e2926', color2: '#1a3530', accent: '#34D399' },
  'ms-polymer-vs-poliuretan':               { color1: '#1E293B', color2: '#1e3a5f', accent: '#818CF8' },
  'malyarna-strichka-yak-vybrat':           { color1: '#2d2416', color2: '#243F6B', accent: '#FCD34D' },
  'hermetyk-dlya-vannoyi-yakyi-ne-chorniye':{ color1: '#0f2744', color2: '#1a3a6b', accent: '#5EEAD4' },
  'chym-prykleity-dzerkalo-plintus-paneli': { color1: '#1E293B', color2: '#2d3748', accent: '#60A5FA' },
  'hermetyzatsiya-vikon-pislya-montazhu':   { color1: '#1E293B', color2: '#1e3a5f', accent: '#38BDF8' },
};

const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Витягуємо палітру з наявної укр обкладинки
async function samplePalette(pngPath) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const c1 = px(30, 30);                      // фон зверху-зліва (fade тут ≈ 0)
  const c2r = px(info.width - 12, info.height - 12); // фон знизу-справа під fade 0.4*(y/630)
  const fade = 0.4 * ((info.height - 12) / info.height);
  const c2 = c2r.map(v => v / (1 - fade));
  const ar = px(3, 30);                       // смуга-акцент: accent*0.8 + c1*0.2
  const accent = ar.map((v, i) => (v - 0.2 * c1[i]) / 0.8);
  return { color1: hex(...c1), color2: hex(...c2), accent: hex(...accent) };
}

function splitLines(text, maxLen) {
  const words = text.split(' ');
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

const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

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

const { data: posts, error } = await supabase
  .from('blog_posts')
  .select('id, slug, title_ru, category_ru, image')
  .eq('is_published', true)
  .like('image', '/blog/covers/%');
if (error) throw error;

let ok = 0, skipped = 0;
for (const p of posts) {
  if (!p.title_ru) { console.log('· skip (no title_ru):', p.slug); skipped++; continue; }
  const srcPng = 'public' + p.image;
  if (!fs.existsSync(srcPng)) { console.log('· skip (no src png):', p.slug); skipped++; continue; }

  const palette = PALETTES[p.slug] ?? await samplePalette(srcPng);
  const category = p.category_ru || 'Советы';
  // Ім'я — за slug СТАТТІ, не за файлом обкладинки: кілька статей можуть
  // переиспользовать одну укр обкладинку, і ім'я від файлу призводило до
  // перезапису одного -ru.png різними заголовками.
  const outName = `/blog/covers/${p.slug}-ru.png`;

  const svg = coverSvg({ title: p.title_ru, category, ...palette });
  await sharp(Buffer.from(svg)).png().toFile('public' + outName);

  const { error: upErr } = await supabase.from('blog_posts').update({ image_ru: outName }).eq('id', p.id);
  if (upErr) { console.error('✗ db update failed:', p.slug, upErr.message); continue; }
  console.log('✓', p.slug, '→', outName, PALETTES[p.slug] ? '(exact palette)' : '(sampled palette)');
  ok++;
}
console.log(`\nГотово: ${ok} обкладинок, пропущено: ${skipped}`);
