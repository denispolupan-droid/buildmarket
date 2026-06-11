export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { buildPdf, fetchImages, PdfGroup } from '../_pdf';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const format            = searchParams.get('format') ?? 'xlsx';
  const priceType         = (searchParams.get('priceType') ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop' | 'price_prom';
  const categoriesParam   = searchParams.get('categories') ?? 'all';
  const includeOutOfStock = searchParams.get('includeOutOfStock') === 'true';
  const showBrand         = searchParams.get('showBrand') !== 'false';
  const showDescriptions  = searchParams.get('showDescriptions') === 'true';
  const showImages        = searchParams.get('showImages') === 'true';
  const filterBrand       = searchParams.get('brand') ?? '';
  const filterSearch      = searchParams.get('search') ?? '';

  const selectedCats = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));
  const priceLabel   = ({
    price_retail: 'Роздрібна ціна (₴)',
    price_unit:   'Оптова ціна (₴)',
    price_drop:   'Ціна дроп (₴)',
    price_prom:   'Ціна Prom.ua (₴)',
  } as Record<string, string>)[priceType] ?? 'Ціна (₴)';
  const dateStr      = new Date().toISOString().slice(0, 10);

  if (format === 'pdf') {
    // ── PDF ─────────────────────────────────────────────────────────────────────
    const [{ data: products, error: prodErr }, { data: stock }, { data: categories }] = await Promise.all([
      db.from('products')
        .select('sku, name, brand, volume, category_slug, image, prom_markup_pct')
        .eq('is_active', true)
        .order('brand').order('name')
        .limit(2000),
      db.from('product_stock')
        .select('sku, price_unit, price_retail, price_drop, price_promo, stock_status')
        .limit(2000),
      db.from('categories')
        .select('slug, name, description, parent_slug, sort_order, prom_commission_pct, prom_markup_pct'),
    ]);

    if (prodErr) return new NextResponse(prodErr.message, { status: 500 });

    const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
    const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

    const catSortOrder = new Map((categories ?? []).map(c => [c.slug, c.sort_order ?? 999]));
    const sortedCats = [...(categories ?? [])].sort((a, b) => {
      const aTop = a.parent_slug ? (catSortOrder.get(a.parent_slug) ?? 999) : (a.sort_order ?? 999);
      const bTop = b.parent_slug ? (catSortOrder.get(b.parent_slug) ?? 999) : (b.sort_order ?? 999);
      if (aTop !== bTop) return aTop - bTop;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });

    const grouped = new Map<string, PdfGroup>();
    for (const cat of sortedCats) {
      if (selectedCats && !selectedCats.has(cat.slug)) continue;
      grouped.set(cat.slug, { catName: cat.name, description: cat.description ?? '', rows: [] });
    }

    const skuImageMap = new Map<string, string>();

    for (const prod of (products ?? [])) {
      const s = stockMap.get(prod.sku);
      if (!s) continue;
      if (!includeOutOfStock && s.stock_status !== 'in_stock') continue;
      if (selectedCats && prod.category_slug && !selectedCats.has(prod.category_slug)) continue;
      if (filterBrand && prod.brand !== filterBrand) continue;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (!prod.name?.toLowerCase().includes(q) && !prod.sku?.toLowerCase().includes(q)) continue;
      }

      const slug = prod.category_slug ?? '__other__';
      const cat  = catMap.get(slug);
      let price: number | null;
      if (priceType === 'price_prom') {
        const markup     = Number((prod as any).prom_markup_pct ?? (cat as any)?.prom_markup_pct ?? 0);
        const commission = Number((cat as any)?.prom_commission_pct ?? 0);
        const base = Number(s.price_retail) || Number(s.price_unit) || 0;
        price = base > 0 ? Math.ceil(base * (1 + markup / 100) / (1 - commission / 100)) : null;
      } else {
        price = Number(s[priceType as 'price_retail' | 'price_unit' | 'price_drop']) || null;
      }

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
      { showBrand, showDescriptions, showImages, priceLabel },
      imageBuffers,
    );

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pricelist_${dateStr}.pdf"`,
      },
    });
  }

  // ── XLSX ───────────────────────────────────────────────────────────────────────
  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, volume, category_slug, is_active, prom_markup_pct')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('brand').order('name'),
    db.from('product_stock')
      .select('sku, price_unit, price_retail, price_drop, stock_status'),
    db.from('categories').select('slug, name, parent_slug, prom_commission_pct, prom_markup_pct').order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
  const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

  const grouped = new Map<string, { catName: string; rows: { name: string; brand: string; volume: string | null; price: number | null }[] }>();

  for (const p of (products ?? [])) {
    const s = stockMap.get(p.sku);
    if (!s) continue;
    if (!includeOutOfStock && s.stock_status !== 'in_stock') continue;
    if (selectedCats && p.category_slug && !selectedCats.has(p.category_slug)) continue;
    if (filterBrand && p.brand !== filterBrand) continue;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) && !p.sku?.toLowerCase().includes(q)) continue;
    }

    const catSlug = p.category_slug ?? '__other__';
    const cat     = catMap.get(catSlug);
    const catName = catSlug !== '__other__' ? (cat?.name ?? catSlug) : 'Інше';
    let price: number | null;
    if (priceType === 'price_prom') {
      const markup     = Number((p as any).prom_markup_pct ?? (cat as any)?.prom_markup_pct ?? 0);
      const commission = Number((cat as any)?.prom_commission_pct ?? 0);
      const base = Number(s.price_retail) || Number(s.price_unit) || 0;
      price = base > 0 ? Math.ceil(base * (1 + markup / 100) / (1 - commission / 100)) : null;
    } else {
      price = Number(s[priceType as 'price_retail' | 'price_unit' | 'price_drop']) || null;
    }

    if (!grouped.has(catSlug)) grouped.set(catSlug, { catName, rows: [] });
    grouped.get(catSlug)!.rows.push({ name: p.name, brand: p.brand, volume: p.volume, price });
  }

  const wb = XLSX.utils.book_new();
  const allRows: (string | number | null)[][] = [];

  allRows.push(['FIXLINE — Прайс-лист', null, null, null]);
  allRows.push([`Дата: ${new Date().toLocaleDateString('uk-UA')}`, null, null, null]);
  allRows.push([]);

  for (const [, { catName, rows }] of grouped) {
    allRows.push([catName]);
    const headers = showBrand ? ['Назва', 'Бренд', "Об'єм / Вага", priceLabel] : ['Назва', "Об'єм / Вага", priceLabel];
    allRows.push(headers);

    for (const r of rows) {
      if (showBrand) {
        allRows.push([r.name, r.brand ?? '', r.volume ?? '', r.price]);
      } else {
        allRows.push([r.name, r.volume ?? '', r.price]);
      }
    }
    allRows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = showBrand
    ? [{ wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 18 }]
    : [{ wch: 50 }, { wch: 14 }, { wch: 18 }];

  const titleCell = ws['A1'];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };

  let rowIdx = 3;
  for (const [, { rows }] of grouped) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
    const cell = ws[cellRef];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
    rowIdx += rows.length + 3;
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pricelist_${dateStr}.xlsx"`,
    },
  });
}
