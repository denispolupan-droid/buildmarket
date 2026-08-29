import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/db-paginate';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_URL  = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';
const CURRENCY  = 'UAH';

// Google Product Taxonomy mapping by category slug prefix
const GOOGLE_CATEGORY: Record<string, string> = {
  'germetyky':           'Hardware > Building Materials > Caulk & Sealants',
  'sylikonovi':          'Hardware > Building Materials > Caulk & Sealants',
  'akrylovi':            'Hardware > Building Materials > Caulk & Sealants',
  'poliuretanovi':       'Hardware > Building Materials > Caulk & Sealants',
  'bitumni':             'Hardware > Building Materials > Caulk & Sealants',
  'ms-polymerni':        'Hardware > Building Materials > Caulk & Sealants',
  'montazhna-pina':      'Hardware > Building Materials > Construction Adhesives',
  'pistoletna-pina':     'Hardware > Building Materials > Construction Adhesives',
  'pobutova-pina':       'Hardware > Building Materials > Construction Adhesives',
  'vohnezakhysna-pina':  'Hardware > Building Materials > Construction Adhesives',
  'kley':                'Hardware > Building Materials > Construction Adhesives',
  'klei':                'Hardware > Building Materials > Construction Adhesives',
  'montazhnyi-klei':     'Hardware > Building Materials > Construction Adhesives',
  'klei-dlya-plytky':    'Hardware > Building Materials > Construction Adhesives',
  'pva-ta-stolyarnyi':   'Hardware > Building Materials > Construction Adhesives',
  'epoksydni-klei':      'Hardware > Building Materials > Construction Adhesives',
  'grunty':              'Hardware > Building Materials',
  'gruntivky':           'Hardware > Building Materials',
  'betonokontakt':       'Hardware > Building Materials',
  'antygrybok':          'Hardware > Building Materials',
  'shpaklivky':          'Hardware > Building Materials',
  'hidroizolyatsiya':    'Hardware > Building Materials',
  'farby':               'Hardware > Painting Supplies & Wall Treatments > Paints',
  'alkidni-farby':       'Hardware > Painting Supplies & Wall Treatments > Paints',
  'farby-3v1':           'Hardware > Painting Supplies & Wall Treatments > Paints',
  'farby-dlya-pidlohy':      'Hardware > Painting Supplies & Wall Treatments > Paints',
  'farby-dlya-radiatoriv':   'Hardware > Painting Supplies & Wall Treatments > Paints',
  'zakhyst-derevyny':    'Hardware > Building Materials',
  'antyseptyk':          'Hardware > Building Materials',
  'instrumenty':         'Hardware > Tools',
  'pistolety':           'Hardware > Tools',
  'strichky':            'Hardware > Building Materials',
  'rozchynnyky':         'Hardware > Building Materials',
};

function googleCategory(slug: string | null): string {
  if (!slug) return 'Hardware > Building Materials';
  for (const [prefix, cat] of Object.entries(GOOGLE_CATEGORY)) {
    if (slug.startsWith(prefix)) return cat;
  }
  return 'Hardware > Building Materials';
}

// image_link у Merchant Center мусить бути абсолютним — відносний шлях
// відхиляє КОЖЕН товар фіду. У БД шлях зберігається відносним ("/img/…").
function imageUrl(product: { sku: string; image: string | null }): string {
  if (!product.image) return `${BASE_URL}/product/${product.sku}/opengraph-image`;
  return product.image.startsWith('http') ? product.image : `${BASE_URL}${product.image.startsWith('/') ? '' : '/'}${product.image}`;
}

function x(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  type ProductRow = {
    sku: string; name: string; brand: string; category_slug: string | null;
    volume: string | null; description: string | null; image: string | null;
    /** головна фасовка лінійки → item_group_id: Shopping групує фасовки в один товар */
    variant_main_sku: string | null;
  };
  type StockRow = { sku: string; price_retail: number | null; price_unit: number | null; stock_status: string };

  const [products, stock] = await Promise.all([
    fetchAllRows<ProductRow>((from, to) => serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, description, image, variant_main_sku')
      .eq('is_active', true)
      .order('sort_order')
      .range(from, to)),
    fetchAllRows<StockRow>((from, to) => serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, stock_status')
      .range(from, to)),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  const items = (products ?? [])
    .filter(p => {
      const s = stockMap.get(p.sku);
      if (!s) return false;
      const price = s.price_retail ?? s.price_unit;
      return s.stock_status === 'in_stock' && (price ?? 0) > 0;
    })
    .map(p => {
      const s = stockMap.get(p.sku)!;
      const price = (s.price_retail ?? s.price_unit ?? 0).toFixed(2);
      const title = x(`${p.brand} ${p.name}${p.volume ? ' ' + p.volume : ''}`);
      const desc  = x(p.description ?? `${p.brand} ${p.name} — будівельна хімія від FIXLINE. Оптом для дилерів та підрядників.`);
      const avail = s.stock_status === 'in_stock' ? 'in stock' : 'out of stock';

      return `    <item>
      <g:id>${x(p.sku)}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${BASE_URL}/product/${x(p.sku)}</g:link>
      <g:image_link>${imageUrl(p)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${avail}</g:availability>
      <g:price>${price} ${CURRENCY}</g:price>
      <g:brand>${x(p.brand)}</g:brand>
      <g:mpn>${x(p.sku)}</g:mpn>
${p.variant_main_sku ? `      <g:item_group_id>${x(p.variant_main_sku)}</g:item_group_id>
` : ''}      <g:google_product_category>${googleCategory(p.category_slug)}</g:google_product_category>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${SHOP_NAME}</title>
    <link>${BASE_URL}</link>
    <description>Будівельна хімія оптом — герметики, монтажна піна, клеї, ґрунтовки, фарби</description>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=7200',
    },
  });
}
