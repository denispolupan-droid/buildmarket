import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/db-paginate';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_URL  = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';

function imageUrl(product: { sku: string; image: string | null }): string {
  return product.image ?? `${BASE_URL}/product/${product.sku}/opengraph-image`;
}

function x(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Для числових характеристик (температури) — виділяємо тільки число
function tempValue(raw: string): string {
  const m = raw.match(/-?\d+/);
  return m ? m[0] : raw;
}

const TEMP_LABELS = new Set([
  'мінімальна температура застосування',
  'максимальна температура застосування',
  'мінімальна температура експлуатації',
  'максимальна температура експлуатації',
]);

// Поля що вже є в стандартних тегах — не дублюємо як param
const SKIP_LABELS = new Set(['бренд', 'країна виробника', 'виробник']);

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  type ProductRow = {
    sku: string; name: string; brand: string; category_slug: string | null;
    volume: string | null; description: string | null; image: string | null;
    product_type: string | null; color: string | null; min_order: number | null;
  };
  type StockRow = { sku: string; price_retail: number | null; price_unit: number | null; stock_status: string };
  type CategoryRow = { slug: string; name: string; parent_slug: string | null };
  type CharRow = { product_sku: string; label: string; value: string };

  const [products, stock, categories, chars] = await Promise.all([
    fetchAllRows<ProductRow>((from, to) => serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, description, image, product_type, color, min_order')
      .eq('is_active', true)
      .order('sort_order')
      .range(from, to)),
    fetchAllRows<StockRow>((from, to) => serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, stock_status')
      .range(from, to)),
    fetchAllRows<CategoryRow>((from, to) => serviceClient
      .from('categories')
      .select('slug, name, parent_slug')
      .order('sort_order')
      .range(from, to)),
    fetchAllRows<CharRow>((from, to) => serviceClient
      .from('product_characteristics')
      .select('product_sku, label, value')
      .order('sort_order')
      .range(from, to)),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  // Групуємо характеристики по SKU
  const charsMap = new Map<string, { label: string; value: string }[]>();
  for (const c of (chars ?? [])) {
    if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
    charsMap.get(c.product_sku)!.push({ label: c.label, value: c.value });
  }

  const offers = (products ?? [])
    .filter(p => {
      const s = stockMap.get(p.sku);
      if (!s) return false;
      const price = s.price_retail ?? s.price_unit;
      return s.stock_status === 'in_stock' && (price ?? 0) > 0;
    })
    .map(p => {
      const s     = stockMap.get(p.sku)!;
      const price = s.price_retail ?? s.price_unit;
      const desc  = p.description ?? `${p.brand} ${p.name}`;
      const avail = s.stock_status === 'in_stock' ? 'true' : 'false';

      // Будуємо params з product_characteristics
      const productChars = charsMap.get(p.sku) ?? [];
      const seenLabels   = new Set<string>();
      const paramLines: string[] = [];

      for (const { label, value } of productChars) {
        const key = label.toLowerCase().trim();
        if (SKIP_LABELS.has(key) || seenLabels.has(key)) continue;
        seenLabels.add(key);

        const val = TEMP_LABELS.has(key) ? tempValue(value) : value;
        paramLines.push(`\n      <param name="${x(label)}">${x(val)}</param>`);
      }

      // Додаємо поля з products якщо ще не є серед characteristics
      if (p.product_type && !seenLabels.has('тип'))
        paramLines.push(`\n      <param name="Тип">${x(p.product_type)}</param>`);
      if (p.color && !seenLabels.has('колір'))
        paramLines.push(`\n      <param name="Колір">${x(p.color)}</param>`);
      if (p.volume && !seenLabels.has("об’єм") && !seenLabels.has("об'єм"))
        paramLines.push(`\n      <param name="Об&apos;єм">${x(p.volume)}</param>`);

      return `    <offer id="${x(p.sku)}" available="${avail}">
      <url>${BASE_URL}/product/${x(p.sku)}</url>
      <price>${price}</price>
      <currencyId>UAH</currencyId>
      <categoryId>${x(p.category_slug ?? 'other')}</categoryId>
      <picture>${imageUrl(p)}</picture>
      <name>${x(p.name)}${p.volume ? ` ${x(p.volume)}` : ''}</name>
      <vendor>${x(p.brand)}</vendor>
      <vendorCode>${x(p.sku)}</vendorCode>
      <description>${x(desc)}</description>
      <delivery>true</delivery>
      <deliveryIncluded>false</deliveryIncluded>${p.min_order && p.min_order > 1 ? `\n      <minAmount>${p.min_order}</minAmount>` : ''}${paramLines.join('')}
    </offer>`;
    })
    .join('\n');

  const cats = (categories ?? [])
    .map(c => `    <category id="${x(c.slug)}"${c.parent_slug ? ` parentId="${x(c.parent_slug)}"` : ''}>${x(c.name)}</category>`)
    .join('\n');

  const yml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${new Date().toISOString().slice(0, 19)}">
  <shop>
    <name>${SHOP_NAME}</name>
    <company>FIXLINE</company>
    <url>${BASE_URL}</url>
    <phone>+${process.env.NP_SENDER_PHONE ?? ''}</phone>
    <currencies><currency id="UAH" rate="1"/></currencies>
    <categories>
${cats}
    </categories>
    <offers>
${offers}
    </offers>
  </shop>
</yml_catalog>`;

  return new NextResponse(yml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=7200',
    },
  });
}
