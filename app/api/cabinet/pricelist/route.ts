import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { requireCustomer } from '../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { dropshipOrderable, dropshipItemName } from '../../../../lib/dropship-order';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ProductRow = { sku: string; name: string; brand: string; category_slug: string | null; volume: string | null; min_order: number | null; is_active: boolean };
type StockRow   = { sku: string; price_drop: number | null; price_retail: number | null; stock_status: string | null };

export async function GET() {
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return auth.response;

  // Пагінація обов'язкова: без неї PostgREST мовчки віддає лише 1000 рядків,
  // і частина товарів випадала б із прайсу без жодної помилки.
  const [products, stock, { data: categories }] = await Promise.all([
    fetchAllRows<ProductRow>((f, t) => serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, volume, min_order, is_active')
      .eq('is_active', true)
      .order('sort_order')
      .order('sku')
      .range(f, t)),
    fetchAllRows<StockRow>((f, t) => serviceClient
      .from('product_stock')
      .select('sku, price_drop, price_retail, stock_status')
      .order('sku')
      .range(f, t)),
    serviceClient.from('categories').select('slug, name').limit(1000),
  ]);

  const stockMap = new Map(stock.map(s => [s.sku, s]));
  const catMap   = new Map((categories ?? []).map(c => [c.slug, c.name]));

  const rows = products
    .map(p => {
      const s = stockMap.get(p.sku);
      return { p, s, item: { ...p, stock_status: s?.stock_status ?? null, price_drop: s?.price_drop ?? null } };
    })
    .filter(({ item }) => dropshipOrderable(item))
    .map(({ p, s, item }) => [
      p.sku,
      p.brand,
      dropshipItemName(item),
      catMap.get(p.category_slug ?? '') ?? '',
      Number(s!.price_drop),
      s!.price_retail ?? '',
      p.min_order ?? 1,
      'В наявності',
    ]);

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

  XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');

  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
  const buf  = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fixline-pricelist-${date}.xlsx"`,
    },
  });
}
