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
  'Aqua-protect', 'БАЙРИС', 'BITUGUM',
]);

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

function buildCategoryIds(categories: { id: number; slug: string; name: string; parent_slug: string | null }[]) {
  const map = new Map<string, number>();
  categories.forEach((c, i) => map.set(c.slug, i + 1));
  return map;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key || key !== process.env.FEED_SECRET_KEY) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [{ data: products }, { data: stock }, { data: categories }, { data: characteristics }] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, description, image, keywords')
      .eq('is_active', true)
      .order('sort_order'),
    serviceClient
      .from('product_stock')
      .select('sku, price_retail, price_unit, stock_qty, stock_status'),
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
  const catIdMap = buildCategoryIds(categories ?? []);

  // Build slug → Prom section ID map (use Prom ID when available, else our sequential ID)
  type CatRow = { slug: string; name: string; parent_slug: string | null; prom_section_id: number | null; prom_section_url: string | null };
  const catData = (categories ?? []) as CatRow[];
  const slugToPromId = new Map<string, number>(
    catData.map(c => [c.slug, c.prom_section_id ?? (catIdMap.get(c.slug) ?? 0)]),
  );

  // Unique Prom sections for <categories> block
  const promSections = new Map<number, string>(); // id → name
  for (const c of catData) {
    if (c.prom_section_id) {
      if (!promSections.has(c.prom_section_id)) {
        // Derive section name from URL slug (e.g. Germetiki → Герметики)
        const sectionName = c.prom_section_url?.split('/').pop() ?? c.name;
        promSections.set(c.prom_section_id, sectionName);
      }
    }
  }
  // Also add our sequential IDs for categories without Prom mapping
  for (const c of catData) {
    if (!c.prom_section_id) {
      const seqId = catIdMap.get(c.slug) ?? 0;
      if (!promSections.has(seqId)) promSections.set(seqId, c.name);
    }
  }

  // Group characteristics by SKU
  const charsMap = new Map<string, { label: string; value: string }[]>();
  for (const c of (characteristics ?? [])) {
    if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
    charsMap.get(c.product_sku)!.push({ label: c.label, value: c.value });
  }

  // Categories XML — output Prom's own section IDs so they're recognized directly
  const catsXml = [...promSections.entries()]
    .map(([id, name]) => `      <category id="${id}">${x(name)}</category>`)
    .join('\n');

  // Offers XML
  const offersXml = (products ?? [])
    .map(p => {
      const s = stockMap.get(p.sku);
      if (!s) return null;
      const price = s.price_retail ?? s.price_unit;
      if (!price || price <= 0) return null;

      const available = s.stock_status === 'in_stock' ? 'true' : 'false';
      const qty       = s.stock_qty ?? 0;
      const catId     = p.category_slug ? (slugToPromId.get(p.category_slug) ?? 1) : 1;

      // Name: don't append volume if already in name
      const nameHasVolume = p.volume ? p.name.includes(p.volume) : false;
      const fullName = x([p.brand, p.name, (!nameHasVolume ? p.volume : null)].filter(Boolean).join(' '));
      const desc     = x(p.description ?? `${p.brand} ${p.name} — будівельна хімія.`);
      const img      = imageUrl(p);

      // Characteristics → <param> tags
      const chars    = charsMap.get(p.sku) ?? [];
      const paramsXml = chars
        .map(c => `        <param name="${x(c.label)}">${x(c.value)}</param>`)
        .join('\n');

      // Volume as param (if not already in characteristics)
      const hasVolumeParam = chars.some(c =>
        c.label.toLowerCase().includes('об') || c.label.toLowerCase().includes('вага') ||
        c.label.toLowerCase().includes('розмір') || c.label.toLowerCase().includes('маса'),
      );
      const volumeParam = p.volume && !hasVolumeParam
        ? `        <param name="Об'єм / Вага">${x(p.volume)}</param>`
        : '';

      // Keywords
      const keywords = p.keywords ? `        <keywords>${x(p.keywords)}</keywords>` : '';

      return `      <offer id="${x(p.sku)}" available="${available}">
        <url>${BASE_URL}/product/${x(p.sku)}</url>
        <price>${price.toFixed(2)}</price>
        <currencyId>UAH</currencyId>
        <categoryId>${catId}</categoryId>
        ${img ? `<picture>${x(img)}</picture>` : ''}
        <name>${fullName}</name>
        <description>${desc}</description>
        ${!PROM_UNKNOWN_BRANDS.has(p.brand ?? '') ? `<vendor>${x(p.brand)}</vendor>` : ''}
        <vendorCode>${x(p.sku)}</vendorCode>
        <stock_quantity>${qty}</stock_quantity>
${paramsXml}
${volumeParam}
${keywords}
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
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
