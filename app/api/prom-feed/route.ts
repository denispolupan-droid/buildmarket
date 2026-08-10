import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/db-paginate';
import { promPrice, promPriceFromBase, resolveMarkup, promCommissionOf, type PromPlan } from '@/lib/marketplace-pricing';
import { mpDescription, mpDescriptionRu } from '@/lib/marketplace-description';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_URL  = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';

// Brands not in Prom.ua manufacturer database — omit <vendor> to avoid "Невідомий виробник" error
const PROM_UNKNOWN_BRANDS = new Set([
  'Bitugum', 'Байрис', 'Aqua Protect', 'Хімконтакт', 'Хімік',
  'Aqua-protect', 'БАЙРИС', 'BITUGUM', 'ПОЛЯРА-ХИМ',
]);

// Fallback country by brand — used when product has no "Країна виробник" characteristic
const BRAND_COUNTRY: Record<string, string> = {
  'AURA':        'Україна',
  'Polifarb':    'Україна',
  'Lacrysil':    'Україна',
  'Дивоцвіт':   'Україна',
  'Lotus':       'Україна',
  'Сталь':       'Україна',
  'Siltek':      'Україна',
  'Ataman':      'Україна',
  'Титан':       'Україна',
  'Байрис':      'Україна',
  'БАЙРИС':      'Україна',
  'Masterplast': 'Україна',
  'Aqua Protect':'Україна',
  'Aqua-protect':'Україна',
  'Sprut-A':     'Україна',
  'Хімік':       'Україна',
  'Хімконтакт':  'Україна',
  'Weco':        'Україна',
  'Werk':        'Україна',
  'ХАDО':        'Україна',
  'Spitce':      'Україна',
  'Budmonster':  'Україна',
  'Krumix':      'Україна',
  'ЗИП':         'Україна',
  'ПОЛЯРА-ХИМ':  'Україна',
  'Bitugum':     'Україна',
  'BITUGUM':     'Україна',
  'Ceresit':     'Німеччина',
  'Pattex':      'Німеччина',
  'Knauf':       'Німеччина',
  'Pufas':       'Німеччина',
  'Henkel':      'Німеччина',
  'Rigips':      'Німеччина',
  'Eskaro':      'Естонія',
  'Wkret-met':   'Польща',
  'Quelyd':      'Франція',
  'HARDEX':      'Китай',
  'Soudal':      'Бельгія',
};

// "Тип використання" inferred from category when product has no such characteristic
const CATEGORY_USAGE_TYPE: Record<string, string> = {
  // Interior only
  'vodoemiulsiyni-interierni':  'Для внутрішніх робіт',
  'farby-dlya-pidlohy':         'Для внутрішніх робіт',
  'farby-dlya-radiatoriv':      'Для внутрішніх робіт',
  'klei-dlya-shpaler':          'Для внутрішніх робіт',
  'pva-ta-stolyarnyi':          'Для внутрішніх робіт',
  'zamazky-dlya-shviv':         'Для внутрішніх робіт',
  'zamazky-epoksydni':          'Для внутрішніх робіт',
  'zamazky-tsementni':          'Для внутрішніх робіт',
  'vologopoglinachi':           'Для внутрішніх робіт',
  // Exterior only
  'vodoemiulsiyni-fasadni':     'Для зовнішніх робіт',
  'alkidni-farby':              'Для зовнішніх робіт',
  'farby-3v1-alkidni':          'Для зовнішніх робіт',
  'moltkovi-farby':             'Для зовнішніх робіт',
  'bitumni-mastyky':            'Для зовнішніх робіт',
  'bitumni-germetyky':          'Для зовнішніх робіт',
  'hidroizolyatsiya':           'Для зовнішніх робіт',
  'hidroizolyatsiyni-mastyky':  'Для зовнішніх робіт',
  'hermetyzuyucha-strichka':    'Для зовнішніх робіт',
  'praimery':                   'Для зовнішніх робіт',
  // Interior + exterior
  'farby':                      'Для внутрішніх і зовнішніх робіт',
  'farby-3v1':                  'Для внутрішніх і зовнішніх робіт',
  'farby-3v1-akrylovi':         'Для внутрішніх і зовнішніх робіт',
  'koloranty':                  'Для внутрішніх і зовнішніх робіт',
  'laky':                       'Для внутрішніх і зовнішніх робіт',
  'morylky':                    'Для внутрішніх і зовнішніх робіт',
  'zakhyst-derevyny':           'Для внутрішніх і зовнішніх робіт',
  'antyseptyki':                'Для внутрішніх і зовнішніх робіт',
  'zakhysni-pokryttya':         'Для внутрішніх і зовнішніх робіт',
  'antygrybok':                 'Для внутрішніх і зовнішніх робіт',
  'gruntivky':                  'Для внутрішніх і зовнішніх робіт',
  'grunty':                     'Для внутрішніх і зовнішніх робіт',
  'gruntivky-gotovi':           'Для внутрішніх і зовнішніх робіт',
  'gruntivky-kontsentraty':     'Для внутрішніх і зовнішніх робіт',
  'betonokontakt':              'Для внутрішніх і зовнішніх робіт',
  'shpaklivky':                 'Для внутрішніх і зовнішніх робіт',
  'izolyatsiyni-strichky':      'Для внутрішніх і зовнішніх робіт',
  'plastyfikatory':             'Для внутрішніх і зовнішніх робіт',
  'plastyfikatory-dlya-betonu': 'Для внутрішніх і зовнішніх робіт',
  'rozchynnyky':                'Для внутрішніх і зовнішніх робіт',
  'ochysnyky':                  'Для внутрішніх і зовнішніх робіт',
  'klei':                       'Для внутрішніх і зовнішніх робіт',
  'kontaktnyi-klei':            'Для внутрішніх і зовнішніх робіт',
  'montazhnyi-klei':            'Для внутрішніх і зовнішніх робіт',
  'klei-dlya-plytky':           'Для внутрішніх і зовнішніх робіт',
  'super-klei':                 'Для внутрішніх і зовнішніх робіт',
  'epoksydni-klei':             'Для внутрішніх і зовнішніх робіт',
  // Sealants (prom_section_id=82210) — Prom accepts only: Універсальний / Для внутрішніх / Для зовнішніх
  'germetyky':                  'Універсальний',
  'akrylovi-germetyky':         'Універсальний',
  'sylikonovi-germetyky':       'Універсальний',
  'neytralny-germetyky':        'Універсальний',
  'poliuretanovi-germetyky':    'Універсальний',
  'zharostiyki-germetyky':      'Універсальний',
  'ms-polymerni-hermetyky':     'Універсальний',
  'nytka-dlya-trub':            'Універсальний',
  // Mounting foam (prom_section_id=13070501) — will update once XML received
  'montazhna-pina':             'Універсальний',
  'pistoletna-pina':            'Універсальний',
  'pobutova-pina':              'Універсальний',
  'vohnezakhysna-pina':         'Універсальний',
  'pina-klei':                  'Універсальний',
};

// ── Prom.ua characteristic mapping ────────────────────────────────────────────

// Normalize our labels to Prom's exact attribute names
const PROM_LABEL_NORM: Record<string, string> = {
  'Ступень блиску':                         'Ступінь блиску',       // опечатка в БД
  'Блиск':                                  'Ступінь блиску',
  'Витрата':                                'Витрата матеріалу',
  'Витрата концентрату':                    'Витрата матеріалу',
  'Мінімальна температура нанесення':       'Мінімальна температура застосування',
  'Максимальна температура нанесення':      'Максимальна температура застосування',
  'Термін придатності':                     'Термін зберігання',
  'Час висихання поверхні':                 'Час висихання (від пилу)',
  'Час поверхневого висихання':             'Час висихання (від пилу)',
  'Час висихання від пилу':                 'Час висихання (від пилу)',
  'Час до наступного шару':                 'Час висихання (наступний шар)',
  'Готовність до експлуатації':             'Час повного висихання',
  'Час затвердіння':                        'Час повного висихання',
  'Країна виробника':                       'Країна виробник',
};

// Prom dropdowns expect feminine adjective forms for gloss level values
const GLOSS_FORM: Record<string, string> = {
  'Матовий':              'Матова',
  'матовий':              'матова',
  'Напівматовий':         'Напівматова',
  'напівматовий':         'напівматова',
  'Глянцевий':            'Глянцева',
  'глянцевий':            'глянцева',
  'Напівглянцевий':       'Напівглянцева',
  'напівглянцевий':       'напівглянцева',
  'Глибокоматовий':       'Глибокоматова',
  'глибокоматовий':       'глибокоматова',
  'Шовковисто-матовий':   'Шовковисто-матова',
  'шовковисто-матовий':   'шовковисто-матова',
  'Шовково-матовий':      'Шовково-матова',
  'шовково-матовий':      'шовково-матова',
};

// Labels that carry drying/working time — we also extract a numeric version
// Note: 'Час початкового схоплення' is handled separately (minutes, not hours)
const DRYING_LABELS = new Set([
  'Час висихання (від пилу)', 'Час висихання',
  'Час висихання (наступний шар)', 'Час повного висихання',
  'Час повного затвердіння', 'Час висихання (дерево)', 'Час висихання (папір)',
]);

// Parse hours from Ukrainian time value: "30 хв" → 0.5, "2 год" → 2
function parseHours(v: string): number | null {
  const hv = v.match(/(\d+(?:[.,]\d+)?)\s*хв/i);  // matches хв, хвилин, хвилини
  if (hv) return Math.round(parseFloat(hv[1].replace(',', '.')) / 60 * 10) / 10;
  const god = v.match(/(\d+(?:[.,]\d+)?)\s*год/i);
  if (god) return parseFloat(god[1].replace(',', '.'));
  return null;
}

// Parse first signed integer: "+5°C до +30°C" → 5, "-10" → -10
function parseSignedInt(v: string): number | null {
  const m = v.match(/([+-]?\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Parse numeric liters from volume string: "0,75 л" → 0.75
function parseLiters(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d+(?:[.,]\d+)?)\s*л/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Parse numeric kg from volume string: "2,7 кг" → 2.7
function parseKg(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/^(\d+(?:[.,]\d+)?)\s*кг$/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Parse numeric grams from volume string: "400 г" → 400
function parseGrams(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/^(\d+(?:[.,]\d+)?)\s*г$/);
  return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null;
}

// Parse volume as мл (for Prom's Об'єм attribute in category 82210 etc.)
// "280 мл" → 280, "0,75 л" → 750, "1 л" → 1000
function parseVolumeML(v: string | null): number | null {
  if (!v) return null;
  const ml = v.match(/(\d+(?:[.,]\d+)?)\s*мл/i);
  if (ml) return Math.round(parseFloat(ml[1].replace(',', '.')));
  const l = parseLiters(v);
  if (l !== null) return Math.round(l * 1000);
  return null;
}

// Parse shelf life in months: "3 роки" → 36, "24 місяці" → 24
function parseMonths(v: string): number | null {
  const mM = v.match(/(\d+)\s*міс/i);
  if (mM) return parseInt(mM[1]);
  const mY = v.match(/(\d+)\s*рок/i);
  if (mY) return parseInt(mY[1]) * 12;
  return null;
}

// Parse minutes: "15 хв" → 15, "30 сек" → 0.5, "2 год" → 120
function parseMinutes(v: string): number | null {
  const secM = v.match(/(\d+(?:[.,]\d+)?)\s*сек/i);
  if (secM) return Math.round(parseFloat(secM[1].replace(',', '.')) / 60 * 10) / 10;
  const hvM = v.match(/(\d+(?:[.,]\d+)?)\s*хв/i);
  if (hvM) return parseFloat(hvM[1].replace(',', '.'));
  const hrM = v.match(/(\d+(?:[.,]\d+)?)\s*год/i);
  if (hrM) return parseFloat(hrM[1].replace(',', '.')) * 60;
  return null;
}

// Normalize gloss value: strip "(рівень N)" / brand prefixes, fix adjective gender
function cleanGlossValue(v: string): string {
  const s = v.replace(/\s*\(рівень\s+\d+\)/gi, '').replace(/^ультрабіла\s+/i, '').trim();
  return GLOSS_FORM[s] ?? s;
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function x(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageUrl(product: { sku: string; image: string | null }): string | null {
  if (!product.image) return null;
  if (product.image.startsWith('/')) return `${BASE_URL}${product.image}`;
  return product.image;
}

function dedup(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  return parts
    .filter(Boolean)
    // replace decimal commas (e.g. "0,9 кг") with placeholder before splitting
    .flatMap(k => (k as string)
      .replace(/(\d),(\d)/g, '$1·$2')
      .split(',')
      .map(s => s.trim().replace(/·/g, ','))
      .filter(Boolean)
    )
    .filter(k => { const lk = k.toLowerCase(); if (seen.has(lk)) return false; seen.add(lk); return true; })
    .join(', ');
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Fetch product_characteristics in 20 parallel pages of 1000 rows each
  // (Supabase PostgREST caps any single response at max_rows=1000 regardless of Range header)
  const CHAR_PAGE = 1000;
  const [products, stock, categories, charPages, { data: planRow }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client, preserves prior field access
    fetchAllRows<any>((f, t) => serviceClient
      .from('products')
      // ВАЖЛИВО: вимкнені (on_prom=false) товари НЕ прибираємо з фіда, а віддаємо з
      // available="false" + залишком 0 — зникнення оффера з фіда Prom трактує як «немає
      // даних» і лишає оголошення в останньому стані. Фід — єдине джерело правди.
      .select('sku, name, name_ru, brand, category_slug, volume, description, description_full, description_ru, description_full_ru, description_mp, description_mp_ru, image, keywords, keywords_ru, min_order, prom_portal_url, prom_markup_pct, on_prom')
      .eq('is_active', true)
      .order('sort_order')
      .range(f, t)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client, preserves prior field access
    fetchAllRows<any>((f, t) => serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, price_retail_old, price_old, stock_qty, stock_status, price_wholesale, price_cost')
      .range(f, t)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client, preserves prior field access
    fetchAllRows<any>((f, t) => serviceClient
      .from('categories')
      .select('id, slug, name, parent_slug, prom_section_id, prom_section_url, prom_commission_pct, prom_commission_pct_econom, prom_markup_pct')
      .order('sort_order')
      .range(f, t)),
    Promise.all(Array.from({ length: 20 }, (_, i) =>
      serviceClient
        .from('product_characteristics')
        .select('product_sku, label, value')
        .order('product_sku')
        .order('sort_order')
        .range(i * CHAR_PAGE, (i + 1) * CHAR_PAGE - 1)
    )),
    serviceClient.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
  ]);

  // Активний тарифний план Prom — визначає, яка колонка комісії діє
  const promPlan = ((planRow as { value?: string } | null)?.value ?? 'single') as PromPlan;

  const characteristics = charPages.flatMap(r => (r.data ?? []) as { product_sku: string; label: string; value: string }[]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  type CatRow = { id: number; slug: string; name: string; parent_slug: string | null; prom_section_id: number | null; prom_section_url: string | null; prom_commission_pct: number | null; prom_commission_pct_econom: number | null; prom_markup_pct: number | null };
  const catData = (categories ?? []) as CatRow[];

  // Each category gets its own DB id — guarantees each <category> has the correct name for its products
  const slugToGroupId = new Map<string, number>(
    catData.map((c) => [c.slug, c.id]),
  );
  // Комісія — з урахуванням активного плану (Економ → econom-колонка)
  const catCommissionMap = new Map<string, number>(
    catData.map(c => [c.slug, promCommissionOf(c, promPlan)]),
  );
  const catMarkupMap = new Map<string, number>(
    catData.filter(c => c.prom_markup_pct != null).map(c => [c.slug, c.prom_markup_pct!]),
  );

  // Group characteristics by SKU
  const charsMap = new Map<string, { label: string; value: string }[]>();
  for (const c of (characteristics ?? [])) {
    if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
    charsMap.get(c.product_sku)!.push({ label: c.label, value: c.value });
  }

  // Emit every category with its own id and portal_url where available
  const catsXml = catData
    .map(c => {
      const portalUrl = c.prom_section_url ? ` portal_url="${x(c.prom_section_url)}"` : '';
      return `      <category id="${c.id}"${portalUrl}>${x(c.name)}</category>`;
    })
    .join('\n');

  // Virtual categories for products with per-product prom_portal_url override
  // Maps portal_url → virtual numeric id (starting at 100000)
  const virtualCatMap = new Map<string, number>();
  let virtualIdCounter = 100000;
  for (const p of (products ?? [])) {
    const url = (p as { prom_portal_url?: string | null }).prom_portal_url;
    if (url && !virtualCatMap.has(url)) {
      virtualCatMap.set(url, ++virtualIdCounter);
    }
  }
  const virtualCatsXml = [...virtualCatMap.entries()]
    .map(([url, vid]) => `      <category id="${vid}" portal_url="${x(url)}">Prom override</category>`)
    .join('\n');

  // Offers XML
  const offersXml = (products ?? [])
    .map(p => {
      const s = stockMap.get(p.sku);
      if (!s) return null;
      const retailPrice = s.price_retail ?? s.price_unit;
      if (!retailPrice || retailPrice <= 0) return null;

      // Ціна — ЄДИНОЮ формулою lib/marketplace-pricing (як усі адмін-екрани):
      // ручний override (price_wholesale) → інакше ціна входу × націнка ÷ (1 − комісія)
      const priceWholesale = (s as { price_wholesale?: number | null }).price_wholesale;
      const productMarkup = (p as { prom_markup_pct?: number | null }).prom_markup_pct;
      const markup     = resolveMarkup(productMarkup, p.category_slug ? (catMarkupMap.get(p.category_slug) ?? 0) : 0);
      const commission = p.category_slug ? (catCommissionMap.get(p.category_slug) ?? 0) : 0;
      const price = promPrice({
        cost: (s as { price_cost?: number | null }).price_cost,
        retail: retailPrice,
        manualOverride: priceWholesale,
        productMarkupPct: productMarkup,
        categoryMarkupPct: p.category_slug ? (catMarkupMap.get(p.category_slug) ?? 0) : 0,
        commissionPct: commission,
      });

      const priceOldBase = s.price_retail != null
        ? ((s as { price_retail_old?: number | null }).price_retail_old ?? null)
        : ((s as { price_old?: number | null }).price_old ?? null);
      let promPriceOld: number | null = null;
      if (!priceWholesale && priceOldBase && priceOldBase > retailPrice) {
        promPriceOld = promPriceFromBase(priceOldBase, markup, commission);
      }
      const hasDiscount = promPriceOld != null && promPriceOld > price;

      // Вимкнений для Prom товар = «недоступний», незалежно від фактичного залишку.
      const enabled   = (p as { on_prom?: boolean | null }).on_prom === true;
      const available = enabled && s.stock_status === 'in_stock' ? 'true' : 'false';
      const qty       = enabled ? (s.stock_qty ?? 0) : 0;
      const productPortalUrl = (p as { prom_portal_url?: string | null }).prom_portal_url;
      const groupId = productPortalUrl && virtualCatMap.has(productPortalUrl)
        ? virtualCatMap.get(productPortalUrl)!
        : (p.category_slug ? (slugToGroupId.get(p.category_slug) ?? 1) : 1);

      // ── Names ──────────────────────────────────────────────────────────────
      // Prom recommends: Brand + Name + Volume.
      // We build this in the feed only — the DB name is never modified.
      // Guards prevent duplication when brand/volume are already in the name.
      const nameRu = (p as { name_ru?: string | null }).name_ru;

      const hasWeight  = (t: string) => /\d[\d,.]*\s*(кг|г\b|мл|л\b)/i.test(t);
      const hasBrand   = (t: string) => t.toLowerCase().includes(p.brand.toLowerCase());
      const promName   = (base: string) => x([
        hasBrand(base)  ? null : p.brand,
        base,
        p.volume && !base.includes(p.volume) && !hasWeight(base) ? p.volume : null,
      ].filter(Boolean).join(' '));

      const fullName   = promName(p.name);
      const fullNameRu = nameRu ? promName(nameRu) : null;

      // ── Descriptions ───────────────────────────────────────────────────────
      // Власний текст для маркетплейсу (див. lib/marketplace-description): на
      // сайті лишається повний опис, сюди йде інший — щоб сторінки не були
      // дублями одна одної. Фолбэк — повний, поки MP-опис не згенеровано.
      const descUk = x(mpDescription(p) || `${p.brand} ${p.name} — будівельна хімія.`);
      // Russian: our translated text stops Prom's auto-translation from overwriting it
      const descRuSource = mpDescriptionRu(p) || null;
      const descRu = descRuSource ? x(descRuSource) : null;

      const img = imageUrl(p);
      if (!img) return null;

      // ── Characteristics ────────────────────────────────────────────────────
      const rawChars = charsMap.get(p.sku) ?? [];

      // Track numeric values we'll output as separate Prom-structured params
      let dryingHours: number | null = null;
      let minTempApply: number | null = null;
      let maxTempApply: number | null = null;
      let minTempOp: number | null = null;
      let maxTempOp: number | null = null;
      let shelfLifeMonths: number | null = null;
      let grabMinutes: number | null = null;
      let foamLiters: number | null = null;
      let waGrams: number | null = null;   // weight from "Вага" characteristic (when p.volume is in ml)

      // Process each characteristic:
      // • normalize label to Prom's expected name
      // • fix adjective gender for "Ступінь блиску" dropdown
      // • extract numeric data for structured fields
      const processedChars = rawChars.map(c => {
        const label = PROM_LABEL_NORM[c.label] ?? c.label;
        let   value = c.value;

        // Normalize gloss value: fix gender, strip "(рівень N)" / brand prefixes
        if (label === 'Ступінь блиску') {
          value = cleanGlossValue(value);
        }

        // Extract numeric drying time (take first match across all time labels)
        if (DRYING_LABELS.has(label) && dryingHours === null) {
          dryingHours = parseHours(value);
        }
        // Extract application temperatures (use normalized label to catch aliases)
        if (label === 'Мінімальна температура застосування' && minTempApply === null) {
          minTempApply = parseSignedInt(value);
        }
        if (label === 'Максимальна температура застосування' && maxTempApply === null) {
          maxTempApply = parseSignedInt(value);
        }
        if (c.label === 'Температура нанесення') {
          // "+5°C до +30°C" → extract both min and max from the range
          const nums = [...value.matchAll(/([+-]?\d+)/g)].map(m => parseInt(m[1]));
          if (nums.length > 0) {
            if (minTempApply === null) minTempApply = Math.min(...nums);
            if (maxTempApply === null) maxTempApply = Math.max(...nums);
          }
        }
        // Operating temperature range (sealants, adhesives, foams)
        if (c.label === 'Температурний діапазон експлуатації') {
          const nums = [...value.matchAll(/([+-]?\d+)/g)].map(m => parseInt(m[1]));
          if (nums.length > 0) {
            if (minTempOp === null) minTempOp = Math.min(...nums);
            if (maxTempOp === null) maxTempOp = Math.max(...nums);
          }
        }
        if (c.label === 'Мінімальна температура експлуатації' && minTempOp === null) {
          minTempOp = parseSignedInt(value);
        }
        if (c.label === 'Максимальна температура експлуатації' && maxTempOp === null) {
          maxTempOp = parseSignedInt(value);
        }
        // Shelf life in months
        if (label === 'Термін зберігання' && shelfLifeMonths === null) {
          shelfLifeMonths = parseMonths(value);
        }
        // Initial grab/set time in minutes (glues, sealants — separate from drying hours)
        if (c.label === 'Час початкового схоплення' && grabMinutes === null) {
          grabMinutes = parseMinutes(value);
        }
        // Foam yield in liters: "до 50 л" → 50
        if (c.label === 'Вихід піни' && foamLiters === null) {
          const fm = value.match(/(\d+)\s*л/i);
          if (fm) foamLiters = parseInt(fm[1]);
        }
        // Weight in grams from "Вага" characteristic (e.g. "880", "880 г", "0,88 кг")
        if ((c.label === 'Вага' || label === 'Вага') && waGrams === null) {
          const gm = value.match(/^(\d+(?:[.,]\d+)?)\s*г$/);
          if (gm) { waGrams = Math.round(parseFloat(gm[1].replace(',', '.'))); }
          else {
            const km = value.match(/^(\d+(?:[.,]\d+)?)\s*кг$/);
            if (km) { waGrams = Math.round(parseFloat(km[1].replace(',', '.')) * 1000); }
            else {
              const plain = parseFloat(value.replace(',', '.'));
              if (!isNaN(plain) && plain > 0) waGrams = Math.round(plain);
            }
          }
        }

        return { label, value };
      });

      // Inject "Країна виробник" from brand lookup if missing in characteristics
      const hasCountry = rawChars.some(c =>
        c.label === 'Країна виробник' || c.label === 'Країна виробника',
      );
      const inferredCountry = !hasCountry && p.brand ? BRAND_COUNTRY[p.brand] ?? null : null;
      const countryParam = inferredCountry
        ? [{ label: 'Країна виробник', value: inferredCountry }]
        : [];

      // Inject "Тип використання" from category if missing in characteristics
      const hasUsageType = rawChars.some(c => c.label === 'Тип використання');
      const inferredUsage = !hasUsageType && p.category_slug
        ? CATEGORY_USAGE_TYPE[p.category_slug] ?? null
        : null;
      const usageTypeParam = inferredUsage
        ? [{ label: 'Тип використання', value: inferredUsage }]
        : [];

      // Multiselect labels allowed to appear multiple times (one <param> per value)
      const MULTISELECT_LABELS = new Set(['Область застосування']);

      // These labels are output as Prom structured numeric <param> tags in numericParamsXml.
      // Exclude them from the free-text paramsXml to avoid duplicate param names in the offer.
      const NUMERIC_STRUCTURED_LABELS = new Set([
        'Мінімальна температура застосування',
        'Максимальна температура застосування',
        'Мінімальна температура експлуатації',
        'Максимальна температура експлуатації',
        'Температурний діапазон експлуатації',   // range form, parsed into min/max
        'Об`єм',       // backtick — goes to numericParamsXml with unit="мл"
        'Вага',        // goes to numericParamsXml with unit="г"
        'Час висихання',  // numericParts already emits this as unit="год"; prevent text dupe
      ]);

      // Deduplicate by normalized label — keep first occurrence (two DB labels may map to the same Prom label)
      // Exception: multiselect labels are allowed multiple rows
      const seenLabels = new Set<string>();
      const dedupedChars = processedChars.filter(c => {
        if (NUMERIC_STRUCTURED_LABELS.has(c.label)) return false; // goes to numericParamsXml only
        if (MULTISELECT_LABELS.has(c.label)) return true;
        if (seenLabels.has(c.label)) return false;
        seenLabels.add(c.label);
        return true;
      });

      // Build text <param> tags (custom characteristics visible to buyers).
      // Multiselect values merged into ONE row use "; " as separator — expand back
      // to one <param> per value. Commas are NOT split (free-text values keep them).
      const paramsXml = [...usageTypeParam, ...countryParam, ...dedupedChars]
        .flatMap(c => {
          if (!MULTISELECT_LABELS.has(c.label) || !c.value.includes(';')) return [c];
          return c.value.split(';').map(v => v.trim()).filter(Boolean)
            .map(v => ({ label: c.label, value: v }));
        })
        .map(c => `        <param name="${x(c.label)}">${x(c.value)}</param>`)
        .join('\n');

      // Volume as text param (if not already in characteristics)
      const hasVolumeChar = rawChars.some(c =>
        c.label.toLowerCase().includes('об') || c.label.toLowerCase().includes('вага') ||
        c.label.toLowerCase().includes('розмір') || c.label.toLowerCase().includes('маса'),
      );
      const volumeTextParam = p.volume && !hasVolumeChar
        ? `        <param name="Об'єм / Вага">${x(p.volume)}</param>`
        : '';

      // Prom structured numeric params — unit attribute is REQUIRED for real-type Prom attributes,
      // otherwise Prom cannot match the param and stores it as a user/custom characteristic instead.
      const numericParts: string[] = [];
      if (dryingHours !== null) {
        numericParts.push(`        <param name="Час висихання" unit="год">${dryingHours}</param>`);
      }
      if (minTempApply !== null) {
        numericParts.push(`        <param name="Мінімальна температура застосування" unit="град.">${minTempApply}</param>`);
      }
      if (maxTempApply !== null) {
        numericParts.push(`        <param name="Максимальна температура застосування" unit="град.">${maxTempApply}</param>`);
      }
      if (minTempOp !== null) {
        numericParts.push(`        <param name="Мінімальна температура експлуатації" unit="град.">${minTempOp}</param>`);
      }
      if (maxTempOp !== null) {
        numericParts.push(`        <param name="Максимальна температура експлуатації" unit="град.">${maxTempOp}</param>`);
      }
      if (shelfLifeMonths !== null) {
        numericParts.push(`        <param name="Термін зберігання" unit="міс.">${shelfLifeMonths}</param>`);
      }
      if (grabMinutes !== null) {
        numericParts.push(`        <param name="Час початкового схоплення" unit="хв">${grabMinutes}</param>`);
      }
      if (foamLiters !== null) {
        numericParts.push(`        <param name="Вихід піни" unit="л">${foamLiters}</param>`);
      }
      const volumeML = parseVolumeML(p.volume);
      if (volumeML !== null) {
        numericParts.push(`        <param name="Об\`єм" unit="мл">${volumeML}</param>`);
        // Foam products can have both volume (мл) and weight (г) as separate Prom attributes
        if (waGrams !== null) {
          numericParts.push(`        <param name="Вага" unit="г">${waGrams}</param>`);
        }
      } else {
        // No liquid volume — derive weight from p.volume or from "Вага" characteristic
        const kg = parseKg(p.volume);
        if (kg !== null) {
          numericParts.push(`        <param name="Вага" unit="г">${Math.round(kg * 1000)}</param>`);
        } else {
          const g = parseGrams(p.volume);
          const weight = g ?? waGrams;
          if (weight !== null) numericParts.push(`        <param name="Вага" unit="г">${weight}</param>`);
        }
      }
      const numericParamsXml = numericParts.join('\n');

      // ── Keywords ───────────────────────────────────────────────────────────
      const COMMERCIAL = /купити|купить|купіт|ціна|цена|цену|оптом|украина|україна/i;
      const filterCommercial = (kw: string) =>
        dedup([kw]).split(', ').filter(k => !COMMERCIAL.test(k)).join(', ');

      const ukKeywords   = filterCommercial(p.keywords ?? '');
      const ruKeywordsRaw = filterCommercial((p as { keywords_ru?: string | null }).keywords_ru ?? '');
      // Trim at last comma boundary to stay within Prom's 250-char limit
      const ruKeywords = ruKeywordsRaw.length > 250
        ? ruKeywordsRaw.slice(0, 251).replace(/,\s*[^,]*$/, '')
        : ruKeywordsRaw;

      // Prom convention: base tags = Russian, _ua tags = Ukrainian
      const kwRu = ruKeywords ? `        <keywords>${x(ruKeywords)}</keywords>` : '';
      const kwUk = ukKeywords ? `        <keywords_ua>${x(ukKeywords)}</keywords_ua>` : '';

      const minQty = (p as { min_order?: number | null }).min_order;

      return `      <offer id="${x(p.sku)}" available="${available}">
        <url>${BASE_URL}/product/${x(p.sku)}</url>
        ${hasDiscount ? `<price>${promPriceOld!.toFixed(2)}</price>\n        <price_promo>${price.toFixed(2)}</price_promo>` : `<price>${price.toFixed(2)}</price>`}
        <currencyId>UAH</currencyId>
        <categoryId>${groupId}</categoryId>
        <picture>${x(img)}</picture>
        ${fullNameRu ? `<name>${fullNameRu}</name>` : `<name>${fullName}</name>`}
        <name_ua>${fullName}</name_ua>
        ${descRu ? `<description>${descRu}</description>` : `<description>${descUk}</description>`}
        <description_ua>${descUk}</description_ua>
        ${!PROM_UNKNOWN_BRANDS.has(p.brand ?? '') ? `<vendor>${x(p.brand)}</vendor>` : ''}
        <vendorCode>${x(p.sku)}</vendorCode>
        ${qty > 0 ? `<stock_quantity>${qty}</stock_quantity>` : ''}
        ${minQty && minQty > 1 ? `<min_quantity>${minQty}</min_quantity>` : ''}
${paramsXml}
${volumeTextParam}
${numericParamsXml}
${kwUk}
${kwRu}
      </offer>`;
    })
    .filter(Boolean)
    .join('\n');

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${now}">
  <shop>
    <name>${SHOP_NAME}</name>
    <company>FIXLINE</company>
    <url>${BASE_URL}</url>
    <currencies>
      <currency id="UAH" rate="1"/>
    </currencies>
    <categories>
${catsXml}
${virtualCatsXml}
    </categories>
    <offers>
${offersXml}
    </offers>
  </shop>
</yml_catalog>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Last-Modified': new Date().toUTCString(),
      'Pragma': 'no-cache',
    },
  });
}
