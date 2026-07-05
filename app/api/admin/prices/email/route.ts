import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';
import { buildPdf, fetchImages, PdfGroup } from '../_pdf';
import { fetchProductsInCatalogOrder } from '../_catalog-order';

const db     = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const email: string = body.email ?? '';
    const p: Record<string, string> = typeof body.xlsxParams === 'string'
      ? JSON.parse(body.xlsxParams) : (body.xlsxParams ?? {});

    if (!email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });

    const priceType        = (p.priceType ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop' | 'price_cost';
    const categoriesParam  = p.categories ?? 'all';
    const includeOOS       = p.includeOutOfStock === 'true';
    const showBrand        = p.showBrand !== 'false';
    const showDescriptions = p.showDescriptions === 'true';
    const showImages       = p.showImages === 'true';
    const selectedCats     = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));
    const filterBrands     = p.brand ? new Set(p.brand.split(',').filter(Boolean)) : null;
    const filterSearch     = p.search ?? '';
    const headerVariant    = (p.headerVariant === 'fop' ? 'fop' : 'fixline') as 'fixline' | 'fop';
    const priceLabel       = { price_retail: 'Роздрібна ціна (₴)', price_unit: 'Оптова ціна (₴)', price_drop: 'Ціна дроп (₴)', price_cost: 'Закупівельна ціна (₴)' }[priceType];

    const { data: categories } = await db.from('categories')
      .select('slug, name, description, parent_slug, sort_order');

    const catSortOrder = new Map((categories ?? []).map(c => [c.slug, c.sort_order ?? 999]));
    const sortedCats = [...(categories ?? [])].sort((a, b) => {
      const aTop = a.parent_slug ? (catSortOrder.get(a.parent_slug) ?? 999) : (a.sort_order ?? 999);
      const bTop = b.parent_slug ? (catSortOrder.get(b.parent_slug) ?? 999) : (b.sort_order ?? 999);
      if (aTop !== bTop) return aTop - bTop;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });

    type EmailProdRow = { sku: string; name: string; brand: string; volume: string | null; category_slug: string | null; image: string | null };
    const [products, { data: stock }] = await Promise.all([
      fetchProductsInCatalogOrder<EmailProdRow>(
        db, 'sku, name, brand, volume, category_slug, image', sortedCats.map(c => c.slug),
      ),
      db.from('product_stock')
        .select('sku, price_unit, price_retail, price_drop, price_cost, price_promo, stock_status')
        .limit(2000),
    ]);

    const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
    const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

    const grouped = new Map<string, PdfGroup>();
    for (const cat of sortedCats) {
      if (selectedCats && !selectedCats.has(cat.slug)) continue;
      grouped.set(cat.slug, { catName: cat.name, description: cat.description ?? '', rows: [] });
    }

    const skuImageMap = new Map<string, string>();

    for (const prod of products) {
      const s = stockMap.get(prod.sku);
      if (!s) continue;
      if (!includeOOS && s.stock_status !== 'in_stock') continue;
      if (selectedCats && prod.category_slug && !selectedCats.has(prod.category_slug)) continue;
      if (filterBrands && !filterBrands.has(prod.brand ?? '')) continue;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (!prod.name?.toLowerCase().includes(q) && !prod.sku?.toLowerCase().includes(q)) continue;
      }

      const price = Number(s[priceType]) || null;
      const slug  = prod.category_slug ?? '__other__';
      const cat   = catMap.get(slug);

      if (!grouped.has(slug)) {
        grouped.set(slug, { catName: cat?.name ?? slug, description: cat?.description ?? '', rows: [] });
      }
      const price_promo = Number(s.price_promo) || null;
      grouped.get(slug)!.rows.push({ sku: prod.sku, name: prod.name, brand: prod.brand, volume: prod.volume, price, price_promo });

      if (showImages && prod.image) skuImageMap.set(prod.sku, prod.image);
    }

    for (const [key, val] of grouped) {
      if (val.rows.length === 0) grouped.delete(key);
    }

    const imageBuffers = showImages ? await fetchImages(skuImageMap) : new Map<string, Buffer>();

    const pdfBuffer = await buildPdf(
      grouped,
      { showBrand, showDescriptions, showImages, priceLabel, headerVariant, isCostPrice: priceType === 'price_cost' },
      imageBuffers,
    );

    const dateLabel  = new Date().toLocaleDateString('uk-UA');
    const dateStr    = new Date().toISOString().slice(0, 10);
    const senderName = headerVariant === 'fop' ? 'ФОП Полупан Д.О.' : 'FixLine';

    const { error: sendErr } = await resend.emails.send({
      from: 'FixLine <orders@fixline.com.ua>',
      to:   [email],
      subject: `Прайс-лист ${senderName} — ${dateLabel}`,
      html: `<div style="font-family:Arial,sans-serif;color:#0F172A">
        <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">${senderName}</div>
          <div style="font-size:20px;font-weight:800">Прайс-лист</div>
        </div>
        <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
          <p style="color:#374151;font-size:14px;margin:0">Актуальний прайс-лист у вкладенні (PDF).</p>
          <p style="color:#6B7280;font-size:12px;margin:8px 0 0">Дата: ${dateLabel}</p>
        </div>
      </div>`,
      attachments: [{ filename: `pricelist_${dateStr}.pdf`, content: pdfBuffer.toString('base64') }],
    });

    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prices/email]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
