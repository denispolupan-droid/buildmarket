import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  'Час повного затвердіння',
]);

// Parse hours from Ukrainian time value: "30 хвилин" → 0.5, "2 години..." → 2
function parseHours(v: string): number | null {
  const hv = v.match(/(\d+(?:[.,]\d+)?)\s*хвилин/i);
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
    .flatMap(k => (k as string).split(',').map(s => s.trim()).filter(Boolean))
    .filter(k => { const lk = k.toLowerCase(); if (seen.has(lk)) return false; seen.add(lk); return true; })
    .join(', ');
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [{ data: products }, { data: stock }, { data: categories }, { data: characteristics }] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, name, name_ru, brand, category_slug, volume, description, description_full, description_ru, description_full_ru, image, keywords, keywords_ru, min_order')
      .eq('is_active', true)
      .order('sort_order'),
    serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, price_retail_old, price_old, stock_qty, stock_status'),
    serviceClient
      .from('categories')
      .select('id, slug, name, parent_slug, prom_section_id, prom_section_url')
      .order('sort_order'),
    serviceClient
      .from('product_characteristics')
      .select('product_sku, label, value')
      .order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  type CatRow = { slug: string; name: string; parent_slug: string | null; prom_section_id: number | null; prom_section_url: string | null };
  const catData = (categories ?? []) as CatRow[];

  const slugToGroupId = new Map<string, number>(
    catData.map((c, i) => [c.slug, c.prom_section_id ?? (i + 1)]),
  );

  // Group characteristics by SKU
  const charsMap = new Map<string, { label: string; value: string }[]>();
  for (const c of (characteristics ?? [])) {
    if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
    charsMap.get(c.product_sku)!.push({ label: c.label, value: c.value });
  }

  const catsXml = catData
    .map(c => {
      const id = slugToGroupId.get(c.slug) ?? 0;
      return `      <category id="${id}">${x(c.name)}</category>`;
    })
    .join('\n');

  // Offers XML
  const offersXml = (products ?? [])
    .map(p => {
      const s = stockMap.get(p.sku);
      if (!s) return null;
      const price = s.price_retail ?? s.price_unit;
      if (!price || price <= 0) return null;
      const priceOld = s.price_retail != null
        ? ((s as { price_retail_old?: number | null }).price_retail_old ?? null)
        : ((s as { price_old?: number | null }).price_old ?? null);
      const hasDiscount = priceOld != null && priceOld > price;

      const available = s.stock_status === 'in_stock' ? 'true' : 'false';
      const qty       = s.stock_qty ?? 0;
      const groupId   = p.category_slug ? (slugToGroupId.get(p.category_slug) ?? 1) : 1;

      // ── Names ──────────────────────────────────────────────────────────────
      const nameRu = (p as { name_ru?: string | null }).name_ru;

      const nameHasVolume   = p.volume ? p.name.includes(p.volume) : false;
      const fullName        = x([p.brand, p.name,   !nameHasVolume   ? p.volume : null].filter(Boolean).join(' '));
      const nameRuHasVolume = nameRu && p.volume ? nameRu.includes(p.volume) : false;
      const fullNameRu      = nameRu
        ? x([p.brand, nameRu, !nameRuHasVolume ? p.volume : null].filter(Boolean).join(' '))
        : null;

      // ── Descriptions ───────────────────────────────────────────────────────
      // Ukrainian: prefer full text, fall back to short
      const descUk = x(
        (p as { description_full?: string | null }).description_full
        ?? p.description
        ?? `${p.brand} ${p.name} — будівельна хімія.`,
      );
      // Russian: our translated text stops Prom's auto-translation from overwriting it
      const descRuSource = (p as { description_full_ru?: string | null }).description_full_ru
        ?? (p as { description_ru?: string | null }).description_ru
        ?? null;
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
        if (c.label === 'Температура нанесення' && minTempApply === null) {
          // "+5°C до +30°C" → take the minimum (first) value
          minTempApply = parseSignedInt(value);
        }
        // Operating temperature range (sealants, adhesives, foams)
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

        return { label, value };
      });

      // Inject "Країна виробник" from brand lookup if missing in characteristics
      const hasCountry = rawChars.some(c => c.label === 'Країна виробник');
      const inferredCountry = !hasCountry && p.brand ? BRAND_COUNTRY[p.brand] ?? null : null;
      const countryParam = inferredCountry
        ? [{ label: 'Країна виробник', value: inferredCountry }]
        : [];

      // Deduplicate by normalized label — keep first occurrence (two DB labels may map to the same Prom label)
      const seenLabels = new Set<string>();
      const dedupedChars = processedChars.filter(c => {
        if (seenLabels.has(c.label)) return false;
        seenLabels.add(c.label);
        return true;
      });

      // Build text <param> tags (custom characteristics visible to buyers)
      const paramsXml = [...countryParam, ...dedupedChars]
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

      // Prom structured numeric params — these populate Prom's category-specific
      // fields that expect pure numbers (дrying time, temperature, volume)
      const numericParts: string[] = [];
      if (dryingHours !== null) {
        numericParts.push(`        <param name="Час висихання (годин)">${dryingHours}</param>`);
      }
      if (minTempApply !== null) {
        numericParts.push(`        <param name="Мінімальна температура застосування (град.)">${minTempApply}</param>`);
      }
      if (maxTempApply !== null) {
        numericParts.push(`        <param name="Максимальна температура застосування (град.)">${maxTempApply}</param>`);
      }
      if (minTempOp !== null) {
        numericParts.push(`        <param name="Мінімальна температура експлуатації (град.)">${minTempOp}</param>`);
      }
      if (maxTempOp !== null) {
        numericParts.push(`        <param name="Максимальна температура експлуатації (град.)">${maxTempOp}</param>`);
      }
      if (shelfLifeMonths !== null) {
        numericParts.push(`        <param name="Термін зберігання (міс.)">${shelfLifeMonths}</param>`);
      }
      if (grabMinutes !== null) {
        numericParts.push(`        <param name="Час початкового схоплення (хв.)">${grabMinutes}</param>`);
      }
      if (foamLiters !== null) {
        numericParts.push(`        <param name="Вихід піни (л)">${foamLiters}</param>`);
      }
      const liters = parseLiters(p.volume);
      if (liters !== null) {
        numericParts.push(`        <param name="Об'єм (л)">${liters}</param>`);
      } else {
        const kg = parseKg(p.volume);
        if (kg !== null) numericParts.push(`        <param name="Вага (кг)">${kg}</param>`);
      }
      const numericParamsXml = numericParts.join('\n');

      // ── Keywords ───────────────────────────────────────────────────────────
      const keywordsRuRaw = (p as { keywords_ru?: string | null }).keywords_ru;
      const ukKeywords = dedup([p.keywords]);
      const ruKeywords = dedup([keywordsRuRaw, nameRu && nameRu !== p.name ? nameRu : null]);

      const kwUk = ukKeywords ? `        <keywords>${x(ukKeywords)}</keywords>` : '';
      const kwRu = ruKeywords ? `        <keywords_ru>${x(ruKeywords)}</keywords_ru>` : '';

      const minQty = (p as { min_order?: number | null }).min_order;

      return `      <offer id="${x(p.sku)}" available="${available}">
        <url>${BASE_URL}/product/${x(p.sku)}</url>
        ${hasDiscount ? `<price>${priceOld!.toFixed(2)}</price>\n        <price_promo>${price.toFixed(2)}</price_promo>` : `<price>${price.toFixed(2)}</price>`}
        <currencyId>UAH</currencyId>
        <categoryId>${groupId}</categoryId>
        <picture>${x(img)}</picture>
        <name>${fullName}</name>
        ${fullNameRu ? `<name_ru>${fullNameRu}</name_ru>` : ''}
        <description>${descUk}</description>
        ${descRu ? `<description_ru>${descRu}</description_ru>` : ''}
        ${!PROM_UNKNOWN_BRANDS.has(p.brand ?? '') ? `<vendor>${x(p.brand)}</vendor>` : ''}
        <vendorCode>${x(p.sku)}</vendorCode>
        <stock_quantity>${qty}</stock_quantity>
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
    </categories>
    <offers>
${offersXml}
    </offers>
  </shop>
</yml_catalog>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
