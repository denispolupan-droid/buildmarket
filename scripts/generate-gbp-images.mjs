import sharp from 'sharp';
import fs from 'fs';

const outDir = 'C:/Users/polupan.denis/OneDrive/Desktop/google-business-photos';
const logoWB64 = 'data:image/svg+xml;base64,' + fs.readFileSync('public/fixline-logo-white.svg').toString('base64');

async function make(filename, svgStr) {
  await sharp(Buffer.from(svgStr)).png().toFile(outDir + '/' + filename);
  console.log('✓', filename);
}

// 1. ОБЛОЖКА
await make('01-обложка.png', `<svg width="1080" height="608" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#1a3a6b"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="608" fill="url(#g)"/>
  <image href="${logoWB64}" x="215" y="140" width="650" height="130"/>
  <line x1="340" y1="312" x2="740" y2="312" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  <text x="540" y="362" font-family="Arial" font-size="26" fill="#94A3B8" text-anchor="middle">Будівельна хімія — оптом та в роздріб по всій Україні</text>
  <rect x="140" y="412" width="170" height="44" rx="22" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)" stroke-width="1"/>
  <text x="225" y="440" font-family="Arial" font-size="17" fill="#93C5FD" text-anchor="middle">Герметики</text>
  <rect x="330" y="412" width="190" height="44" rx="22" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)" stroke-width="1"/>
  <text x="425" y="440" font-family="Arial" font-size="17" fill="#93C5FD" text-anchor="middle">Монтажна піна</text>
  <rect x="540" y="412" width="120" height="44" rx="22" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)" stroke-width="1"/>
  <text x="600" y="440" font-family="Arial" font-size="17" fill="#93C5FD" text-anchor="middle">Клеї</text>
  <rect x="680" y="412" width="160" height="44" rx="22" fill="rgba(59,130,246,0.25)" stroke="rgba(59,130,246,0.6)" stroke-width="1"/>
  <text x="760" y="440" font-family="Arial" font-size="17" fill="#93C5FD" text-anchor="middle">Ґрунтовки</text>
  <text x="540" y="560" font-family="Arial" font-size="16" fill="#475569" text-anchor="middle">fixline.com.ua</text>
</svg>`);

// 2. ПЕРЕВАГИ
await make('02-переваги.png', `<svg width="1080" height="608" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#243F6B"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="608" fill="url(#g)"/>
  <text x="540" y="78" font-family="Arial" font-size="32" font-weight="bold" fill="white" text-anchor="middle">Чому обирають FIXLINE</text>
  <line x1="200" y1="100" x2="880" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

  <rect x="60" y="128" width="220" height="200" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="170" y="198" font-family="Arial" font-size="40" text-anchor="middle">&#x1F4B0;</text>
  <text x="170" y="248" font-family="Arial" font-size="18" font-weight="bold" fill="white" text-anchor="middle">Оптові ціни</text>
  <text x="170" y="276" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">Прямі поставки</text>
  <text x="170" y="296" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">від виробників</text>

  <rect x="310" y="128" width="220" height="200" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="420" y="198" font-family="Arial" font-size="40" text-anchor="middle">&#x1F69A;</text>
  <text x="420" y="248" font-family="Arial" font-size="18" font-weight="bold" fill="white" text-anchor="middle">Швидка доставка</text>
  <text x="420" y="276" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">Нова Пошта по</text>
  <text x="420" y="296" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">всій Україні</text>

  <rect x="560" y="128" width="220" height="200" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="670" y="198" font-family="Arial" font-size="40" text-anchor="middle">&#x1F4E6;</text>
  <text x="670" y="248" font-family="Arial" font-size="18" font-weight="bold" fill="white" text-anchor="middle">Дропшипінг</text>
  <text x="670" y="276" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">Відправка від</text>
  <text x="670" y="296" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">вашого імені</text>

  <rect x="810" y="128" width="210" height="200" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="915" y="198" font-family="Arial" font-size="40" text-anchor="middle">&#x1F3D7;</text>
  <text x="915" y="248" font-family="Arial" font-size="18" font-weight="bold" fill="white" text-anchor="middle">Асортимент</text>
  <text x="915" y="276" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">1000+ позицій</text>
  <text x="915" y="296" font-family="Arial" font-size="14" fill="#94A3B8" text-anchor="middle">провідних брендів</text>

  <line x1="160" y1="378" x2="920" y2="378" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="270" y="438" font-family="Arial" font-size="36" font-weight="bold" fill="#3B82F6" text-anchor="middle">1000+</text>
  <text x="270" y="468" font-family="Arial" font-size="15" fill="#64748B" text-anchor="middle">товарів</text>
  <text x="540" y="438" font-family="Arial" font-size="36" font-weight="bold" fill="#3B82F6" text-anchor="middle">20+</text>
  <text x="540" y="468" font-family="Arial" font-size="15" fill="#64748B" text-anchor="middle">брендів</text>
  <text x="810" y="438" font-family="Arial" font-size="30" font-weight="bold" fill="#3B82F6" text-anchor="middle">Вся Україна</text>
  <text x="810" y="468" font-family="Arial" font-size="15" fill="#64748B" text-anchor="middle">доставка</text>

  <text x="540" y="568" font-family="Arial" font-size="15" fill="#334155" text-anchor="middle">fixline.com.ua</text>
</svg>`);

// 3. ДРОПШИПІНГ
await make('03-дропшипінг.png', `<svg width="1080" height="608" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f2027"/>
      <stop offset="50%" stop-color="#203a43"/>
      <stop offset="100%" stop-color="#2c5364"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="608" fill="url(#g)"/>
  <text x="540" y="100" font-family="Arial" font-size="42" font-weight="bold" fill="white" text-anchor="middle">Дропшипінг</text>
  <text x="540" y="148" font-family="Arial" font-size="22" fill="#94A3B8" text-anchor="middle">Продавайте будівельну хімію без складу</text>
  <line x1="100" y1="178" x2="980" y2="178" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="540" y="248" font-family="Arial" font-size="20" fill="#CBD5E1" text-anchor="middle">&#x2705;  Реєструєтесь на fixline.com.ua</text>
  <text x="540" y="304" font-family="Arial" font-size="20" fill="#CBD5E1" text-anchor="middle">&#x2705;  Розміщуєте наші товари у своєму магазині</text>
  <text x="540" y="360" font-family="Arial" font-size="20" fill="#CBD5E1" text-anchor="middle">&#x2705;  Приймаєте замовлення від своїх клієнтів</text>
  <text x="540" y="416" font-family="Arial" font-size="20" fill="#CBD5E1" text-anchor="middle">&#x2705;  Ми відправляємо товар вашому клієнту</text>
  <rect x="300" y="460" width="480" height="60" rx="30" fill="#3B82F6"/>
  <text x="540" y="498" font-family="Arial" font-size="20" font-weight="bold" fill="white" text-anchor="middle">Підключитись на fixline.com.ua</text>
</svg>`);

// 4. АСОРТИМЕНТ
await make('04-асортимент.png', `<svg width="1080" height="608" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="608" fill="url(#g)"/>
  <text x="540" y="72" font-family="Arial" font-size="34" font-weight="bold" fill="white" text-anchor="middle">Широкий асортимент</text>
  <text x="540" y="112" font-family="Arial" font-size="19" fill="#64748B" text-anchor="middle">Все для будівництва та ремонту в одному місці</text>

  <rect x="60" y="148" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="170" y="192" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Герметики</text>
  <text x="170" y="216" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">силікон, акрил, PU, бітум</text>

  <rect x="300" y="148" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="410" y="192" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Монтажна піна</text>
  <text x="410" y="216" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">побутова, проф, вогнестійка</text>

  <rect x="540" y="148" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="650" y="192" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Клеї та рідкі цвяхи</text>
  <text x="650" y="216" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">монтажні, ПВА, епоксидні</text>

  <rect x="780" y="148" width="240" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="900" y="192" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Ґрунтовки</text>
  <text x="900" y="216" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">глибок., бетоноконтакт</text>

  <rect x="60" y="256" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="170" y="300" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Гідроізоляція</text>
  <text x="170" y="324" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">мастики, бітум, рулонна</text>

  <rect x="300" y="256" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="410" y="300" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Захист дерева</text>
  <text x="410" y="324" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">антисептики, морилки, лаки</text>

  <rect x="540" y="256" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="650" y="300" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Фарби</text>
  <text x="650" y="324" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">алкідні, акрилові, 3в1</text>

  <rect x="780" y="256" width="240" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="900" y="300" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Кріплення</text>
  <text x="900" y="324" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">дюбелі, анкери, стрічки</text>

  <rect x="60" y="364" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="170" y="408" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Шпаклівки</text>
  <text x="170" y="432" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">стартові, фінішні, вологост.</text>

  <rect x="300" y="364" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="410" y="408" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Затирки</text>
  <text x="410" y="432" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">цементні, епоксидні</text>

  <rect x="540" y="364" width="220" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="650" y="408" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Інструмент</text>
  <text x="650" y="432" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">пістолети, шпателі, валики</text>

  <rect x="780" y="364" width="240" height="88" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="900" y="408" font-family="Arial" font-size="15" font-weight="bold" fill="#E2E8F0" text-anchor="middle">Розчинники</text>
  <text x="900" y="432" font-family="Arial" font-size="13" fill="#64748B" text-anchor="middle">очисники, перетвор. іржі</text>

  <text x="540" y="562" font-family="Arial" font-size="16" fill="#334155" text-anchor="middle">fixline.com.ua — більше 1000 позицій в наявності</text>
</svg>`);

console.log('Всі зображення готові!');
