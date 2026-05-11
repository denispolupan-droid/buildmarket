import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUT = 'public/blog/covers';
fs.mkdirSync(OUT, { recursive: true });

const logoB64 = 'data:image/svg+xml;base64,' + fs.readFileSync('public/fixline-logo-white.svg').toString('base64');

// Split text into lines of max maxLen chars, at word boundaries
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

const ARTICLES = [
  { slug: 'gruntivscha-navishcho-i-yaku-vybrat',   title: 'Ґрунтовка: навіщо потрібна і яку вибрати',                           category: 'Поради', color1: '#1E293B', color2: '#1e3a5f', accent: '#60A5FA' },
  { slug: 'kley-dlya-remontu-vybir',               title: 'Клей для ремонту: монтажний, рідкі цвяхи чи епоксидний?',            category: 'Поради', color1: '#1E293B', color2: '#2d3748', accent: '#60A5FA' },
  { slug: 'hidroizolyatsiya-fundamentu-i-vannoyi',  title: 'Гідроізоляція: фундамент, ванна, балкон — матеріали та технологія', category: 'Поради', color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  { slug: 'zakhyst-derevyny-antyseptyk-lak-oliya',  title: 'Захист деревини: антисептик, лак, олія чи воск — що коли?',         category: 'Поради', color1: '#1a2e1a', color2: '#1e3b2e', accent: '#4ADE80' },
  { slug: 'yak-vybrat-farbu',                       title: 'Як вибрати фарбу: алкідна, акрилова чи 3 в 1?',                     category: 'Поради', color1: '#2d1b4e', color2: '#1e293b', accent: '#C084FC' },
  { slug: 'yak-vybrat-hermetyk',                    title: 'Як вибрати герметик: повний гід для майстра та замовника',          category: 'Поради', color1: '#1E293B', color2: '#243F6B', accent: '#60A5FA' },
  { slug: 'montazhna-pina-yak-vykorystovuvaty',     title: 'Монтажна піна: як правильно вибрати і використовувати',             category: 'Поради', color1: '#1e2d3b', color2: '#243F6B', accent: '#FCD34D' },
  { slug: 'shpaklivka-stin-startova-finishna',      title: 'Шпаклівка стін: стартова, фінішна, вологостійка — як вибрати',     category: 'Поради', color1: '#2d2416', color2: '#3b2e1a', accent: '#FCA5A5' },
  { slug: 'zatyrka-dlya-plytky',                    title: 'Затирка для плитки: цементна чи епоксидна — що вибрати',           category: 'Поради', color1: '#1a1e2d', color2: '#1e293b', accent: '#60A5FA' },
  { slug: 'peretvoryuvach-irzhi',                   title: 'Перетворювач іржі: коли потрібен і як правильно використовувати',  category: 'Поради', color1: '#2d1a1a', color2: '#3b2020', accent: '#F87171' },
  { slug: 'vologopoglynych',                        title: 'Вологопоглинач: від сирості, цвілі та запаху у квартирі',          category: 'Поради', color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  { slug: 'plastyfikator-dlya-betonu',              title: 'Пластифікатор для бетону: навіщо потрібен і який вибрати',         category: 'Поради', color1: '#1e2926', color2: '#1a3530', accent: '#34D399' },
  { slug: 'ms-polymer-vs-poliuretan',               title: 'МС-полімерний vs поліуретановий герметик — у чому різниця',        category: 'Поради', color1: '#1E293B', color2: '#1e3a5f', accent: '#818CF8' },
  { slug: 'malyarna-strichka-yak-vybrat',           title: 'Малярна стрічка: як вибрати і правильно використовувати',          category: 'Поради', color1: '#2d2416', color2: '#243F6B', accent: '#FCD34D' },
];

for (const a of ARTICLES) {
  const lines = splitLines(a.title, 36);
  const lineH = 56;
  const totalTitleH = lines.length * lineH;
  const titleY = 315 - totalTitleH / 2 + 40;

  const tspans = lines.map((line, i) =>
    `<tspan x="600" dy="${i === 0 ? 0 : lineH}">${line}</tspan>`
  ).join('');

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a.color1}"/>
      <stop offset="100%" stop-color="${a.color2}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#fade)"/>

  <!-- Decorative circles -->
  <circle cx="1050" cy="120" r="180" fill="${a.accent}" opacity="0.06"/>
  <circle cx="150" cy="520" r="120" fill="${a.accent}" opacity="0.05"/>

  <!-- Accent line -->
  <rect x="0" y="0" width="6" height="630" fill="${a.accent}" opacity="0.8"/>

  <!-- Category badge -->
  <rect x="60" y="60" width="120" height="34" rx="17" fill="${a.accent}" opacity="0.18"/>
  <rect x="60" y="60" width="120" height="34" rx="17" fill="none" stroke="${a.accent}" stroke-width="1" opacity="0.5"/>
  <text x="120" y="82" font-family="Arial" font-size="14" font-weight="bold" fill="${a.accent}" text-anchor="middle">${a.category}</text>

  <!-- Title -->
  <text x="600" y="${titleY}" font-family="Arial" font-size="46" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${tspans}</text>

  <!-- Separator -->
  <rect x="60" y="510" width="1080" height="1" fill="rgba(255,255,255,0.1)"/>

  <!-- Logo -->
  <image href="${logoB64}" x="60" y="528" width="220" height="50"/>

  <!-- URL -->
  <text x="1140" y="556" font-family="Arial" font-size="15" fill="rgba(255,255,255,0.3)" text-anchor="end">fixline.com.ua</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${a.slug}.png`);
  console.log('✓', a.slug);
}

console.log('\nДотово! Всі обкладинки у public/blog/covers/');
