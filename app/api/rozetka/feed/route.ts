import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { formatForRozetka, toRozetkaVolume } from '../../../../lib/rozetka-name';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { getSmartTariff } from '../../../../lib/rozetka-smart';
import { computeSmartFee } from '../../../../lib/rozetka-smart-tariff';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://fixline.com.ua';
const SHOP_NAME = 'Fixline';
const COMPANY = 'Fixline';

// Характеристики-переліки: у БД один рядок зі значеннями через кому,
// у фіді — окремий <param> на кожне значення (як і в Prom-фіді)
const MULTISELECT_LABELS = new Set(['Область застосування']);

function x(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip ASCII control chars (0-31 except tab=9, LF=10, CR=13)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export async function GET() {
  const db = createServiceClient();

  type Cat = { id: number; slug: string; name: string; rozetka_category_id: string | null; rozetka_commission_pct: number | null; rozetka_markup_pct: number | null };
  type Stock = { price_retail: number | null; price_cost: number | null; price_old: number | null; stock_qty: number | null; stock_status: string | null };
  type Char = { label: string; value: string; sort_order: number };
  type Product = {
    sku: string; name: string; rozetka_name: string | null; brand: string; category_slug: string;
    on_rozetka: boolean | null; rozetka_markup_pct: number | null; rozetka_smart: boolean | null;
    image: string | null; color: string | null; volume: string | null;
    description: string | null; description_full: string | null;
    description_ru: string | null; description_full_ru: string | null;
    stock: Stock | Stock[] | null;
    characteristics: Char[] | null;
  };

  const [categories, products] = await Promise.all([
    fetchAllRows<Cat>((from, to) => db
      .from('categories')
      .select('id, slug, name, rozetka_category_id, rozetka_commission_pct, rozetka_markup_pct')
      .order('sort_order')
      .range(from, to)),
    // ВАЖЛИВО: вимкнені (on_rozetka=false) товари НЕ прибираємо з фіда, а віддаємо з
    // available="false" + залишком 0. Зникнення оффера з фіда Rozetka трактує як «немає
    // даних» і лишає картку в останньому стані (реальний кейс: 38 карток Polifarb місяць
    // висіли активними по застарілій ціні). Фід — єдине джерело правди для кабінету.
    fetchAllRows<Product>((from, to) => db.from('products').select(`
      sku, name, rozetka_name, brand, category_slug, image, color, volume,
      on_rozetka, rozetka_markup_pct, rozetka_smart,
      description, description_full, description_ru, description_full_ru,
      stock:product_stock(price_retail, price_cost, price_old, stock_qty, stock_status),
      characteristics:product_characteristics(label, value, sort_order)
    `).eq('is_active', true).order('sort_order').range(from, to)),
  ]);

  function rzPrice(retail: number, commission: number, markup: number): number {
    const withMarkup = retail * (1 + markup / 100);
    const withComm   = commission > 0 ? withMarkup / (1 - commission / 100) : withMarkup;
    return Math.ceil(withComm / 5) * 5;
  }

  // Компенсація Rozetka Smart за порогами суми замовлення (з ПДВ) —
  // чинний тариф з адмінки (Товари Rozetka → «Умови Smart»)
  const smartTariff = await getSmartTariff();
  const smartFee = (p: number) => computeSmartFee(p, smartTariff);

  // Товар у програмі Smart (products.rozetka_smart): надбавка до ціни, що покриває
  // компенсацію доставки з урахуванням комісії на саму надбавку:
  // P' = P + fee(P')/(1 − комісія). Тариф ступінчастий, тому якщо надбавка
  // перекидає ціну через поріг (399→400, 699→700) — рахуємо з більшим тарифом.
  function smartPrice(P: number, commission: number): number {
    const c = commission > 0 ? commission / 100 : 0.15;
    let fee = smartFee(P);
    let raised = P + fee / (1 - c);
    if (smartFee(raised) !== fee) {
      const fee2 = smartFee(raised);
      const raised2 = P + fee2 / (1 - c);
      if (smartFee(raised2) === fee2) { fee = fee2; raised = raised2; }
    }
    return Math.ceil(raised / 5) * 5;
  }

  const catMap = new Map<string, Cat>((categories as Cat[])?.map(c => [c.slug, c]) || []);

  // Filter to products with a retail price
  const offers = ((products as Product[]) || []).filter(p => {
    const s = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    return s && Number(s.price_retail) > 0;
  });

  // Collect used category slugs to only emit needed categories
  const usedSlugs = new Set(offers.map(p => p.category_slug));
  const usedCats = ((categories as Cat[]) || []).filter(c => usedSlugs.has(c.slug));

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<yml_catalog date="${now}">`);
  lines.push('<shop>');
  lines.push(`  <name>${x(SHOP_NAME)}</name>`);
  lines.push(`  <company>${x(COMPANY)}</company>`);
  lines.push(`  <url>${SITE_URL}/</url>`);
  lines.push('  <currencies>');
  lines.push('    <currency id="UAH" rate="1"/>');
  lines.push('  </currencies>');
  lines.push('  <categories>');
  for (const cat of usedCats) {
    const rzAttr = cat.rozetka_category_id ? ` rz_id="${cat.rozetka_category_id}"` : '';
    lines.push(`    <category id="${cat.id}"${rzAttr}>${x(cat.name)}</category>`);
  }
  lines.push('  </categories>');
  lines.push('  <offers>');

  for (const p of offers) {
    const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    if (!stock) continue;
    const cat = catMap.get(p.category_slug);
    if (!cat) continue;

    const retail     = Number(stock.price_retail);
    const cost       = Number(stock.price_cost ?? 0);
    const base       = cost > 0 ? cost : retail;
    const commission = Number(cat.rozetka_commission_pct ?? 0);
    const markup     = Number(p.rozetka_markup_pct ?? cat.rozetka_markup_pct ?? 0);
    const basePrice  = commission > 0 || markup > 0 ? rzPrice(base, commission, markup) : retail;
    const price      = p.rozetka_smart ? smartPrice(basePrice, commission) : basePrice;
    const priceOld   = stock.price_old ? Number(stock.price_old) : null;
    // Same "in stock" rule as the storefront (ShopClient/CatalogClient) — suppliers report a
    // binary in_stock/out_of_stock status, not exact counts, so stock_qty alone is unreliable.
    const rawQty  = Math.max(0, Math.floor(Number(stock.stock_qty) || 0));
    // Вимкнений для Rozetka товар = «недоступний», незалежно від фактичного залишку.
    const enabled = p.on_rozetka === true;
    const inStock = enabled && (stock.stock_status === 'in_stock' || rawQty >= 1);
    const available = inStock ? 'true' : 'false';
    // Rozetka requires a real positive stock_quantity to actually list an offer as buyable —
    // available="true" with quantity 0 (or the tag omitted) is NOT enough, confirmed against a
    // competitor's live feed (every one of their 964 available offers carries a positive count,
    // the 5 unavailable ones are the only stock_quantity=0). We don't track exact counts, so use
    // a conservative placeholder for in-stock items instead of the real (always-0) number.
    const DEFAULT_IN_STOCK_QTY = 50;
    const qty = inStock ? (rawQty > 0 ? rawQty : DEFAULT_IN_STOCK_QTY) : 0;

    const imgUrl = p.image
      ? (p.image.startsWith('http') ? p.image : `${SITE_URL}${p.image}`)
      : null;

    const productUrl = `${SITE_URL}/shop/${p.category_slug}`;
    const descUa = p.description_full || p.description || '';
    const descRu = p.description_full_ru || p.description_ru || '';

    const chars: Char[] = [...(p.characteristics || [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const charLabels = new Set(chars.map(c => c.label));

    lines.push(`    <offer id="${x(p.sku)}" available="${available}">`);
    lines.push(`      <price>${price}</price>`);
    if (priceOld && priceOld > price) {
      lines.push(`      <price_old>${priceOld}</price_old>`);
    }
    lines.push(`      <currencyId>UAH</currencyId>`);
    lines.push(`      <categoryId>${cat.id}</categoryId>`);
    if (imgUrl) {
      lines.push(`      <picture>${x(imgUrl)}</picture>`);
    }
    lines.push(`      <url>${x(productUrl)}</url>`);
    lines.push(`      <vendor>${x(p.brand)}</vendor>`);
    lines.push(`      <article>${x(p.sku)}</article>`);
    const rzName = p.rozetka_name || formatForRozetka(p.name, p.brand, p.volume, p.color);
    lines.push(`      <name_ua>${x(rzName)}</name_ua>`);
    lines.push(`      <name>${x(rzName)}</name>`);
    // Always present, matching the competitor feed's pattern (stock_quantity on every offer,
    // 0 only alongside available="false").
    lines.push(`      <stock_quantity>${qty}</stock_quantity>`);
    // <description> = Russian if available, otherwise Ukrainian (required field)
    // <description_ua> = Ukrainian (only if different from <description>)
    if (descRu) {
      lines.push(`      <description><![CDATA[${descRu}]]></description>`);
      if (descUa) lines.push(`      <description_ua><![CDATA[${descUa}]]></description_ua>`);
    } else if (descUa) {
      lines.push(`      <description><![CDATA[${descUa}]]></description>`);
    }
    for (const c of chars) {
      if (!c.label || !c.value) continue;
      // Multiselect, злитий в один рядок через "; " — окремий <param> на кожне
      // значення. По комах НЕ ріжемо: вільний текст зі списками лишається цілим.
      if (MULTISELECT_LABELS.has(c.label) && c.value.includes(';')) {
        const parts = c.value.split(';').map(v => v.trim()).filter(Boolean);
        for (const v of parts) lines.push(`      <param name="${x(c.label)}">${x(v)}</param>`);
      } else {
        lines.push(`      <param name="${x(c.label)}">${x(c.value)}</param>`);
      }
    }
    if (p.color && !charLabels.has('Колір')) {
      lines.push(`      <param name="Колір">${x(p.color)}</param>`);
    }
    if (p.volume && !charLabels.has('Фасування') && !charLabels.has("Об'єм")) {
      lines.push(`      <param name="Фасування">${x(toRozetkaVolume(p.volume))}</param>`);
    }
    lines.push(`    </offer>`);
  }

  lines.push('  </offers>');
  lines.push('</shop>');
  lines.push('</yml_catalog>');

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  });
}
