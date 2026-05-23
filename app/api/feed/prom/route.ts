import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, description, image, product_type, color, min_order')
      .eq('is_active', true)
      .order('sort_order'),
    serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, stock_status'),
    serviceClient
      .from('categories')
      .select('slug, name, parent_slug')
      .order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  const offers = (products ?? [])
    .filter(p => {
      const s = stockMap.get(p.sku);
      if (!s) return false;
      const price = s.price_retail ?? s.price_unit;
      return s.stock_status === 'in_stock' && price > 0;
    })
    .map(p => {
      const s = stockMap.get(p.sku)!;
      const price = s.price_retail ?? s.price_unit;
      const desc  = p.description ?? `${p.brand} ${p.name}`;
      const avail = s.stock_status === 'in_stock' ? 'true' : 'false';

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
      <deliveryIncluded>false</deliveryIncluded>${p.min_order && p.min_order > 1 ? `\n      <minAmount>${p.min_order}</minAmount>` : ''}${p.product_type ? `\n      <param name="Тип">${x(p.product_type)}</param>` : ''}${p.color ? `\n      <param name="Колір">${x(p.color)}</param>` : ''}${p.volume ? `\n      <param name="Об'єм">${x(p.volume)}</param>` : ''}
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
