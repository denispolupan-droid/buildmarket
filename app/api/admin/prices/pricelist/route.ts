import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

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
  const priceType         = (searchParams.get('priceType') ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop';
  const categoriesParam   = searchParams.get('categories') ?? 'all';
  const includeOutOfStock = searchParams.get('includeOutOfStock') === 'true';
  const showBrand         = searchParams.get('showBrand') !== 'false';

  const selectedCats = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));

  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, volume, category_slug, is_active')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('brand').order('name'),
    db.from('product_stock')
      .select('sku, price_unit, price_retail, price_drop, stock_status'),
    db.from('categories').select('slug, name, parent_slug').order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
  const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));
  const priceLabel = { price_retail: 'Роздрібна ціна (₴)', price_unit: 'Оптова ціна (₴)', price_drop: 'Ціна дроп (₴)' }[priceType];

  // Group products by category
  const grouped = new Map<string, { catName: string; rows: { name: string; brand: string; volume: string | null; price: number | null }[] }>();

  for (const p of (products ?? [])) {
    const s = stockMap.get(p.sku);
    if (!s) continue;
    if (!includeOutOfStock && s.stock_status !== 'in_stock') continue;
    if (selectedCats && p.category_slug && !selectedCats.has(p.category_slug)) continue;

    const price = Number(s[priceType]) || null;
    const catSlug = p.category_slug ?? '__other__';
    const catName = catSlug !== '__other__' ? (catMap.get(catSlug)?.name ?? catSlug) : 'Інше';

    if (!grouped.has(catSlug)) grouped.set(catSlug, { catName, rows: [] });
    grouped.get(catSlug)!.rows.push({ name: p.name, brand: p.brand, volume: p.volume, price });
  }

  // Build workbook
  const wb = XLSX.utils.book_new();

  // ── Main sheet ─────────────────────────────────────────────────────────────
  const allRows: (string | number | null)[][] = [];

  // Header
  allRows.push(['FIXLINE — Прайс-лист', null, null, null]);
  allRows.push([`Дата: ${new Date().toLocaleDateString('uk-UA')}`, null, null, null]);
  allRows.push([]);

  for (const [, { catName, rows }] of grouped) {
    // Category header
    allRows.push([catName]);
    // Column headers
    const headers = showBrand ? ['Назва', 'Бренд', "Об'єм / Вага", priceLabel] : ['Назва', "Об'єм / Вага", priceLabel];
    allRows.push(headers);

    for (const r of rows) {
      if (showBrand) {
        allRows.push([r.name, r.brand ?? '', r.volume ?? '', r.price]);
      } else {
        allRows.push([r.name, r.volume ?? '', r.price]);
      }
    }
    allRows.push([]); // spacer
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths
  ws['!cols'] = showBrand
    ? [{ wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 18 }]
    : [{ wch: 50 }, { wch: 14 }, { wch: 18 }];

  // Style: title row bold
  const titleCell = ws['A1'];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };

  // Style category headers bold
  let rowIdx = 3;
  for (const [, { rows }] of grouped) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
    const cell = ws[cellRef];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
    rowIdx += rows.length + 3; // rows + header + spacer
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pricelist_${date}.xlsx"`,
    },
  });
}
