import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getRole(user) !== 'dropship') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, min_order')
      .eq('is_active', true)
      .order('sort_order'),
    serviceClient
      .from('product_stock')
      .select('sku, price_drop, price_retail, stock_status'),
    serviceClient
      .from('categories')
      .select('slug, name'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
  const catMap   = new Map((categories ?? []).map(c => [c.slug, c.name]));

  const rows = (products ?? [])
    .filter(p => {
      const s = stockMap.get(p.sku);
      return s?.stock_status === 'in_stock' && (s?.price_drop ?? 0) > 0;
    })
    .map(p => {
      const s = stockMap.get(p.sku)!;
      return [
        p.sku,
        p.brand,
        p.name + (p.volume ? ` ${p.volume}` : ''),
        catMap.get(p.category_slug ?? '') ?? '',
        s.price_drop,
        s.price_retail ?? '',
        p.min_order ?? 1,
        'В наявності',
      ];
    });

  const headers = [
    'Артикул',
    'Бренд',
    'Назва',
    'Категорія',
    'Ваша ціна (₴)',
    'Роздрібна ціна (₴)',
    'Мін. замовлення',
    'Статус',
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 20 },
    { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 12 },
  ];

  // Жирний заголовок
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');

  const date = new Date().toISOString().slice(0, 10);
  const buf  = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fixline-pricelist-${date}.xlsx"`,
    },
  });
}
