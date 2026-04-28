import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getCategories } from '../../../../lib/supabase';

const BASE_URL = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';

// Простий множник для формування дропшип-ціни (роздріб × 0.9)
// В майбутньому замінити на окреме поле price_dropship у БД
const DROPSHIP_RATIO = 0.9;

export async function GET(request: NextRequest) {
  // Перевірка API-ключа
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.DROPSHIP_FEED_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);

  const catMap = Object.fromEntries(categories.map(c => [c.slug, c.name]));

  const offers = products
    .filter(p => p.is_active && (p.stock?.stock_qty ?? 0) > 0 && (p.stock?.price_retail ?? 0) > 0)
    .map(p => {
      const retailPrice  = p.stock!.price_retail!;
      const dropPrice    = Math.round(retailPrice * DROPSHIP_RATIO * 100) / 100;
      const inStock      = (p.stock?.stock_qty ?? 0) >= (p.min_order ?? 1);
      const catName      = catMap[p.category_slug ?? ''] ?? 'Будівельна хімія';
      const description  = p.description ?? `${p.brand} ${p.name}`;

      return `
    <offer id="${p.sku}" available="${inStock}">
      <url>${BASE_URL}/product/${p.sku}</url>
      <price>${dropPrice}</price>
      <currencyId>UAH</currencyId>
      <categoryId>${p.category_slug ?? 'other'}</categoryId>
      <name>${escXml(p.name)}${p.volume ? ` ${escXml(p.volume)}` : ''}</name>
      <vendor>${escXml(p.brand)}</vendor>
      <vendorCode>${escXml(p.sku)}</vendorCode>
      <description>${escXml(description)}</description>
      <stock_quantity>${p.stock?.stock_qty ?? 0}</stock_quantity>
      ${p.product_type ? `<param name="Тип">${escXml(p.product_type)}</param>` : ''}
      ${p.color        ? `<param name="Колір">${escXml(p.color)}</param>` : ''}
      ${p.volume       ? `<param name="Об'єм">${escXml(p.volume)}</param>` : ''}
    </offer>`;
    })
    .join('\n');

  const cats = categories.map(c =>
    `<category id="${c.slug}"${c.parent_slug ? ` parentId="${c.parent_slug}"` : ''}>${escXml(c.name)}</category>`
  ).join('\n    ');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${new Date().toISOString().slice(0, 19)}">
  <shop>
    <name>${SHOP_NAME}</name>
    <url>${BASE_URL}</url>
    <currencies>
      <currency id="UAH" rate="1"/>
    </currencies>
    <categories>
    ${cats}
    </categories>
    <offers>
${offers}
    </offers>
  </shop>
</yml_catalog>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
