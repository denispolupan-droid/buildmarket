import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { productDisplayName, variantBaseName } from '../../../lib/seo/meta';
import { fetchAllRows } from '../../../lib/db-paginate';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_URL  = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';

function x(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageUrl(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith('/')) return `${BASE_URL}${image}`;
  return image;
}

// Google Shopping title/description length limits
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [products, stock, { data: categories }] = await Promise.all([
    // paginate: past 1000 products the feed would silently drop items and
    // Merchant Center would stop listing them.
    fetchAllRows((f, t) => serviceClient
      .from('products')
      .select('sku, slug, name, brand, category_slug, volume, description, description_full, image')
      .eq('is_active', true)
      .order('sort_order')
      .range(f, t)),
    fetchAllRows((f, t) => serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_promo, stock_status')
      .range(f, t)),
    serviceClient
      .from('categories')
      .select('slug, name, parent_slug'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
  type CatRow = { slug: string; name: string; parent_slug: string | null };
  const catMap = new Map(((categories ?? []) as CatRow[]).map(c => [c.slug, c]));

  function categoryPath(slug: string | null): string | null {
    if (!slug) return null;
    const cat = catMap.get(slug);
    if (!cat) return null;
    const parent = cat.parent_slug ? catMap.get(cat.parent_slug) : null;
    return parent ? `${parent.name} > ${cat.name}` : cat.name;
  }

  // item_group_id: групуємо фасовки одного продукту (бренд + назва без об'єму),
  // id групи — найменший SKU у групі
  const groupId = new Map<string, string>();
  for (const p of products ?? []) {
    const key = `${p.brand.trim().toLowerCase()}::${variantBaseName(p.name)}`;
    const existing = groupId.get(key);
    if (!existing || p.sku < existing) groupId.set(key, p.sku);
  }

  const items = (products ?? [])
    .map(p => {
      const s = stockMap.get(p.sku);
      if (!s) return null;

      // Ціна у фіді має точно збігатися зі сторінкою: базова = роздрібна,
      // акційна = g:sale_price. price_unit (опт) у публічний фід не потрапляє.
      const price = s.price_retail;
      if (!price || price <= 0) return null;
      const salePrice = s.price_promo && s.price_promo > 0 && s.price_promo < price
        ? s.price_promo
        : null;

      const img = imageUrl(p.image);
      if (!img) return null;

      const available = s.stock_status === 'in_stock' ? 'in stock' : 'out of stock';

      const title = truncate(productDisplayName(p), 150);

      const rawDesc = (p as { description_full?: string | null }).description_full
        ?? p.description
        ?? `${title} — будівельна хімія від FIXLINE. Доставка по всій Україні.`;
      const description = truncate(rawDesc, 5000);

      const productType = categoryPath(p.category_slug);
      const gKey = `${p.brand.trim().toLowerCase()}::${variantBaseName(p.name)}`;
      const gid = groupId.get(gKey);

      return `    <item>
      <g:id>${x(p.sku)}</g:id>
      <title>${x(title)}</title>
      <description>${x(description)}</description>
      <link>${BASE_URL}/product/${x(p.slug ?? p.sku)}</link>
      <g:image_link>${x(img)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${available}</g:availability>
      <g:price>${price.toFixed(2)} UAH</g:price>
      ${salePrice ? `<g:sale_price>${salePrice.toFixed(2)} UAH</g:sale_price>` : ''}
      <g:brand>${x(p.brand)}</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
      ${gid ? `<g:item_group_id>${x(gid)}</g:item_group_id>` : ''}
      ${productType ? `<g:product_type>${x(productType)}</g:product_type>` : ''}
    </item>`;
    })
    .filter(Boolean)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${SHOP_NAME} — будівельна хімія оптом та в роздріб</title>
    <link>${BASE_URL}</link>
    <description>Каталог товарів FIXLINE для Google Merchant Center</description>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
