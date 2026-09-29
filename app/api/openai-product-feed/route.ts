import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { productDisplayName } from '../../../lib/seo/meta';
import { getCategoryNameRu } from '../../../lib/ru';
import { fetchAllRows } from '../../../lib/db-paginate';
import { SITE_URL } from '../../../lib/site';

/**
 * Фід товарів за специфікацією OpenAI Product Feed (Agentic Commerce, версія
 * спеки 2026-01-30) — JSONL, по товару на рядок. Це вхід у пошук товарів у
 * ChatGPT (discovery); приймання фідів поки за запрошенням, тож роут — щоб
 * подати заявку з готовою адресою і не втрачати час, коли відкриють.
 * Обов'язкові поля: item_id, title, description, url, brand, seller_name,
 * image_url, availability, price ("169.00 UAH"). Ціна = роздрібна з product_stock,
 * як на сторінці; gtin — лише коли заповнений (міграція 120).
 *
 * Закритий ключем, як і Google-фід: /api/ у robots заборонений.
 */
const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) return new NextResponse('Unauthorized', { status: 401 });
  const lang: 'uk' | 'ru' = request.nextUrl.searchParams.get('lang') === 'ru' ? 'ru' : 'uk';

  const [products, stock, { data: categories }] = await Promise.all([
    fetchAllRows<{
      sku: string; slug: string | null; name: string; name_ru: string | null; brand: string; category_slug: string | null;
      volume: string | null; description: string | null; description_ru: string | null; image: string | null; gtin: string | null;
      variant_main_sku: string | null;
    }>((f, t) => serviceClient.from('products')
      .select('sku, slug, name, name_ru, brand, category_slug, volume, description, description_ru, image, gtin, variant_main_sku')
      .eq('is_active', true).order('sort_order').range(f, t)),
    fetchAllRows<{ sku: string; price_retail: number | null; price_promo: number | null; stock_status: string | null }>((f, t) =>
      serviceClient.from('product_stock').select('sku, price_retail, price_promo, stock_status').order('id').range(f, t)),
    serviceClient.from('categories').select('slug, name, parent_slug'),
  ]);
  const stockMap = new Map(stock.map(s => [s.sku, s]));
  const catMap = new Map((categories ?? []).map(c => [c.slug, c]));
  const catName = (slug: string | null): string | null => {
    const c = slug ? catMap.get(slug) : null;
    if (!c) return null;
    const parent = c.parent_slug ? catMap.get(c.parent_slug) : null;
    const nm = (x: { slug: string; name: string }) => (lang === 'ru' ? getCategoryNameRu(x.slug, x.name) : x.name);
    return parent ? `${nm(parent)} > ${nm(c)}` : nm(c);
  };
  const prefix = lang === 'ru' ? '/ru' : '';

  const lines: string[] = [];
  for (const p of products) {
    const s = stockMap.get(p.sku);
    if (!s || !s.price_retail || s.price_retail <= 0 || !p.image) continue;
    const img = p.image.startsWith('/') ? `${SITE_URL}${p.image}` : p.image;
    const sale = s.price_promo && s.price_promo > 0 && s.price_promo < s.price_retail ? s.price_promo : null;
    const row: Record<string, unknown> = {
      item_id: p.sku,
      title: productDisplayName(p, lang).slice(0, 150),
      description: ((lang === 'ru' ? p.description_ru : null) ?? p.description ?? productDisplayName(p, lang)).slice(0, 5000),
      url: `${SITE_URL}${prefix}/product/${p.slug ?? p.sku}`,
      brand: p.brand,
      seller_name: 'FIXLINE',
      seller_url: SITE_URL,
      image_url: img,
      availability: s.stock_status === 'in_stock' ? 'in_stock' : 'out_of_stock',
      price: `${s.price_retail.toFixed(2)} UAH`,
      condition: 'new',
      mpn: p.sku,
    };
    if (sale) row.sale_price = `${sale.toFixed(2)} UAH`;
    if (p.gtin) row.gtin = p.gtin;
    if (p.variant_main_sku) row.group_id = p.variant_main_sku;
    const cat = catName(p.category_slug);
    if (cat) row.product_category = cat;
    lines.push(JSON.stringify(row));
  }

  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'application/jsonl; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename="fixline-products-${lang}.jsonl"`,
    },
  });
}
