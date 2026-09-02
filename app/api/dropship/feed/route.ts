import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escapeOrTerm } from '../../../../lib/pg-filter';
import { fetchAllRows } from '../../../../lib/db-paginate';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_URL  = 'https://fixline.com.ua';
const SHOP_NAME = 'FIXLINE';

// Куди відносити товар без категорії. YML не дозволяє offer без categoryId, а
// одна така позиція в каталозі є завжди — краще окрема «Інше», ніж товар, що
// випав з фіда. Номер завідомо вищий за будь-який id з таблиці категорій.
const OTHER_CATEGORY_ID = 999999;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Validate token — partner_code or customer UUID. escapeOrTerm strips filter
  // metachars so a crafted token can't inject extra OR conditions.
  const safeToken = escapeOrTerm(token);
  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, is_active')
    .or(`id.eq.${safeToken},partner_code.eq.${safeToken}`)
    .eq('is_active', true)
    .single();

  if (!customer) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Load catalog
  const [products, stock, { data: categories }] = await Promise.all([
    // paginate past the 1000-row cap so a growing catalog isn't truncated
    fetchAllRows((f, t) => serviceClient.from('products').select('sku, name, brand, category_slug, volume, color, product_type, description, image').eq('is_active', true).order('sort_order').range(f, t)),
    fetchAllRows((f, t) => serviceClient.from('product_stock').select('sku, price_drop, stock_status').range(f, t)),
    serviceClient.from('categories').select('id, slug, name, parent_slug, prom_section_url').order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  // id категорій — ЧИСЛОВІ. Prom.ua, основний майданчик наших дропшиперів, не
  // приймає імпорт, де category id — рядок. Наш власний робочий фід для Prom
  // віддає саме числа; тримаємо однаково, інакше партнер спіткнеться на
  // першому ж імпорті, а виглядати це буде як «у вас поганий фід».
  const catIdBySlug = new Map((categories ?? []).map(c => [c.slug, c.id]));

  const offers = (products ?? [])
    .filter(p => {
      const s = stockMap.get(p.sku);
      return s?.stock_status === 'in_stock' && (s?.price_drop ?? 0) > 0;
    })
    .map(p => {
      const price = stockMap.get(p.sku)!.price_drop;
      const desc  = p.description ?? `${p.brand} ${p.name}`;
      const img   = p.image ?? `${BASE_URL}/product/${p.sku}/opengraph-image`;
      const catId = catIdBySlug.get(p.category_slug ?? '') ?? OTHER_CATEGORY_ID;
      return `    <offer id="${p.sku}" available="true">
      <url>${BASE_URL}/product/${p.sku}</url>
      <price>${price}</price>
      <currencyId>UAH</currencyId>
      <categoryId>${catId}</categoryId>
      <picture>${img}</picture>
      <name>${x(p.name)}${p.volume ? ` ${x(p.volume)}` : ''}</name>
      <vendor>${x(p.brand)}</vendor>
      <vendorCode>${x(p.sku)}</vendorCode>
      <description>${x(desc)}</description>${p.product_type ? `\n      <param name="Тип">${x(p.product_type)}</param>` : ''}${p.color ? `\n      <param name="Колір">${x(p.color)}</param>` : ''}${p.volume ? `\n      <param name="Об'єм">${x(p.volume)}</param>` : ''}
    </offer>`;
    })
    .join('\n');

  const cats = [
    ...(categories ?? []).map(c => {
      const parentId = c.parent_slug ? catIdBySlug.get(c.parent_slug) : undefined;
      // portal_url прив'язує нашу категорію до дерева Prom — з ним товари
      // розкладаються по розділах магазину партнера самі, без ручного мапінгу.
      const portal = c.prom_section_url ? ` portal_url="${x(c.prom_section_url)}"` : '';
      return `    <category id="${c.id}"${parentId ? ` parentId="${parentId}"` : ''}${portal}>${x(c.name)}</category>`;
    }),
    `    <category id="${OTHER_CATEGORY_ID}">Інше</category>`,
  ].join('\n');

  const yml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${new Date().toISOString().slice(0, 19)}">
  <shop>
    <name>${SHOP_NAME}</name>
    <url>${BASE_URL}</url>
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
      // Півгодини, а не дві. Прайси постачальників синкаються раз на 2 години,
      // і на кеші в 2 години партнер міг тримати дані вчетверо старіші за
      // обіцяні «оновлюється кожні 2 години». Фід персональний (токен у URL),
      // партнерів одиниці — економити тут нема на чому.
      'Cache-Control': 'public, max-age=1800',
    },
  });
}

function x(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
