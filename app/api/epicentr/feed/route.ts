import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { epicentrPrice } from '../../../../lib/marketplace-pricing';
import { mpDescription } from '../../../../lib/marketplace-description';
import { epicentrAvailabilityOf, toEpicentrId } from '../../../../lib/epicentr-availability';
import { EPICENTR_COUNTRY_CODE, EPICENTR_BRAND_CODE } from '../../../../lib/epicentr-dictionaries';
import { epicentrName, epicentrDescription, epicentrWeightGrams } from '../../../../lib/epicentr-content';
import { resolveCountry } from '../../../../lib/brand-country';
import { mapEpicentrAttributes } from '../../../../lib/epicentr-attributes';

/**
 * XML-фід для маркетплейсу Епіцентр (кабінет → «Імпорт товарів» / «Автооновлення»).
 *
 * Формат — за XML-шаблоном Епіцентру (supportm.epicentrk.ua/xmlfayl: country_of_origin,
 * brand, weight, measure, ratio — це <param paramcode=…> з valuecode із довідників API),
 * контент — за «Загальними вимогами до контенту» (lib/epicentr-content):
 *   <yml_catalog date="YYYY-MM-DD HH:MM"><offers><offer id available>…
 *   Обов'язкові для чернетки: id (≤25 симв.), available, <price>, <name lang="ua">,
 *   категорія, бренд, країна виробника, ≥1 фото; для публікації — опис,
 *   характеристики і параметри пакування (вага в г).
 *   Ключ: <offer id> = «Артикул» картки в кабінеті — за ним працює автооновлення
 *   цін/наявності і /v1/offers (sku). Тому id = наш SKU, як у Prom/Rozetka.
 *   <availability> перекриває available: in_stock / under_the_order / out_of_stock.
 *   <category code> — код з дерева категорій Епіцентру (categories.epicentr_category_code).
 *   Розміри — мм, вага — г. Російські name/description не шлемо (UA-версія сайту).
 *   Характеристики — лише з довідників Епіцентру (lib/epicentr-attributes:
 *   paramcode/valuecode за набором атрибутів категорії); вільний текст площадка ігнорує.
 *
 * Як і у фідах Prom/Rozetka, вимкнені (on_epicentr=false) товари НЕ прибираємо, а
 * віддаємо available="false": зникнення офера площадка трактує як «немає даних».
 *
 * Захист — ?key=FEED_SECRET_KEY (як /api/prom-feed): фід містить наші ціни для
 * площадки, а не публічні.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://fixline.com.ua';

function x(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!process.env.FEED_SECRET_KEY || key !== process.env.FEED_SECRET_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceClient();

  type Cat = { id: number; slug: string; name: string; epicentr_category_code: string | null; epicentr_commission_pct: number | null; epicentr_markup_pct: number | null };
  type Stock = { price_retail: number | null; price_cost: number | null; price_old: number | null; stock_qty: number | null; stock_status: string | null };
  type Char = { label: string; value: string; sort_order: number };
  type Product = {
    sku: string; name: string; rozetka_name: string | null; brand: string; category_slug: string; slug: string | null;
    on_epicentr: boolean | null; epicentr_markup_pct: number | null;
    image: string | null; color: string | null; volume: string | null;
    description: string | null; description_full: string | null; description_mp: string | null;
    stock: Stock | Stock[] | null;
    characteristics: Char[] | null;
  };

  const [categories, products] = await Promise.all([
    fetchAllRows<Cat>((from, to) => db
      .from('categories')
      .select('id, slug, name, epicentr_category_code, epicentr_commission_pct, epicentr_markup_pct')
      .order('sort_order')
      .range(from, to)),
    fetchAllRows<Product>((from, to) => db.from('products').select(`
      sku, name, rozetka_name, brand, category_slug, slug, image, color, volume,
      on_epicentr, epicentr_markup_pct,
      description, description_full, description_mp,
      stock:product_stock(price_retail, price_cost, price_old, stock_qty, stock_status),
      characteristics:product_characteristics(label, value, sort_order)
    `).eq('is_active', true).order('sort_order').range(from, to)),
  ]);

  const catMap = new Map<string, Cat>(categories.map(c => [c.slug, c]));

  const offers = products.filter(p => {
    const s = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    return s && Number(s.price_retail) > 0 && catMap.has(p.category_slug);
  });

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<yml_catalog date="${now}">`);
  lines.push('  <offers>');

  for (const p of offers) {
    const stock = (Array.isArray(p.stock) ? p.stock[0] : p.stock)!;
    const cat   = catMap.get(p.category_slug)!;

    const retail = Number(stock.price_retail);
    const price  = epicentrPrice({
      cost: stock.price_cost != null ? Number(stock.price_cost) : null,
      retail,
      productMarkupPct: p.epicentr_markup_pct != null ? Number(p.epicentr_markup_pct) : null,
      categoryMarkupPct: cat.epicentr_markup_pct != null ? Number(cat.epicentr_markup_pct) : null,
      commissionPct: Number(cat.epicentr_commission_pct ?? 0),
    });
    const priceOld = stock.price_old ? Number(stock.price_old) : null;

    const inStock = epicentrAvailabilityOf(p.on_epicentr === true, stock) === 'in_stock';

    const pics = p.image ? [p.image.startsWith('http') ? p.image : `${SITE_URL}${p.image}`] : [];

    const chars = [...(p.characteristics || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const name    = epicentrName(p);
    const desc    = epicentrDescription(mpDescription(p));
    const country = resolveCountry(chars, p.brand);
    const weight  = epicentrWeightGrams({ name: p.name, volume: p.volume, characteristics: chars });

    // offer id — без розділових знаків (вимога XML): 1603-014 → 1603014
    lines.push(`    <offer id="${x(toEpicentrId(p.sku))}" available="${inStock ? 'true' : 'false'}">`);
    lines.push(`      <price>${price}</price>`);
    if (priceOld && priceOld > price) lines.push(`      <price_old>${priceOld}</price_old>`);
    lines.push(`      <availability>${inStock ? 'in_stock' : 'out_of_stock'}</availability>`);
    // Код категорії Епіцентру = код набору характеристик (перевірено по /v2/pim/categories:
    // attributeSets[].code збігається з code категорії)
    if (cat.epicentr_category_code) {
      lines.push(`      <category code="${x(cat.epicentr_category_code)}">${x(cat.name)}</category>`);
      lines.push(`      <attribute_set code="${x(cat.epicentr_category_code)}">${x(cat.name)}</attribute_set>`);
    } else {
      lines.push(`      <category>${x(cat.name)}</category>`);
    }
    for (const u of pics) lines.push(`      <picture>${x(u)}</picture>`);
    // Два шаблони Епіцентру: старий (yak-importuvaty-tovary) чекає бренд/країну/вагу
    // тегами з code, новий (xmlfayl) — <param paramcode>. Віддаємо обидва.
    const brandCode = p.brand ? EPICENTR_BRAND_CODE[p.brand] : undefined;
    if (p.brand) lines.push(brandCode ? `      <vendor code="${brandCode}">${x(p.brand)}</vendor>` : `      <vendor>${x(p.brand)}</vendor>`);
    lines.push(`      <name lang="ua">${x(name)}</name>`);
    if (desc) lines.push(`      <description lang="ua"><![CDATA[${desc.replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>`);
    // Системні атрибути — за зразком xmlfayl: valuecode із довідників (lib/epicentr-dictionaries)
    const countryCode = country ? EPICENTR_COUNTRY_CODE[country] : undefined;
    if (country && countryCode) {
      lines.push(`      <country_of_origin code="${countryCode}">${x(country)}</country_of_origin>`);
      lines.push(`      <param paramcode="country_of_origin" name="Країна-виробник" valuecode="${countryCode}">${x(country)}</param>`);
    }
    if (p.brand && brandCode) lines.push(`      <param paramcode="brand" name="Бренд" valuecode="${brandCode}">${x(p.brand)}</param>`);
    lines.push('      <param paramcode="measure" name="Міра виміру" valuecode="measure_pcs">шт.</param>');
    lines.push('      <param paramcode="ratio" name="Мінімальна кратність товару"><![CDATA[1]]></param>');
    if (weight) {
      lines.push(`      <weight>${weight}</weight>`);
      lines.push(`      <param paramcode="weight" name="Вага"><![CDATA[${weight}]]></param>`);
    }

    // Характеристики за словниками Епіцентру (набір = код категорії)
    const mapped = mapEpicentrAttributes(cat.epicentr_category_code, { name: p.name, description: p.description_mp, volume: p.volume, color: p.color, characteristics: chars });
    for (const a of mapped.params) {
      if (a.valuecode) {
        lines.push(`      <param paramcode="${x(a.code)}" name="${x(a.title)}" valuecode="${x(a.valuecode)}">${x(a.value)}</param>`);
      } else {
        lines.push(`      <param paramcode="${x(a.code)}" name="${x(a.title)}"><![CDATA[${a.value.replace(/]]>/g, ']]]]><![CDATA[>')}]]></param>`);
      }
    }
    lines.push('    </offer>');
  }

  lines.push('  </offers>');
  lines.push('</yml_catalog>');

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
