import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';
import * as XLSX from 'xlsx';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const email: string = body.email ?? '';
  const xlsxParams: Record<string, string> = typeof body.xlsxParams === 'string'
    ? JSON.parse(body.xlsxParams)
    : (body.xlsxParams ?? {});

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  }

  const priceType = (xlsxParams.priceType ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop';
  const categoriesParam = xlsxParams.categories ?? 'all';
  const includeOutOfStock = xlsxParams.includeOutOfStock === 'true';
  const showBrand = xlsxParams.showBrand !== 'false';
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

  const allRows: (string | number | null)[][] = [];
  allRows.push(['FIXLINE — Прайс-лист', null, null, null]);
  allRows.push([`Дата: ${new Date().toLocaleDateString('uk-UA')}`, null, priceLabel, null]);
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

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = showBrand
    ? [{ wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 18 }]
    : [{ wch: 50 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);

  const { error } = await resend.emails.send({
    from: 'FixLine <orders@fixline.com.ua>',
    to:   [email],
    subject: `Прайс-лист FixLine — ${new Date().toLocaleDateString('uk-UA')}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0F172A">
      <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">FixLine — Прайс-лист</div>
        <div style="font-size:20px;font-weight:800">fixline.com.ua</div>
      </div>
      <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
        <p style="color:#374151;font-size:14px;margin:0">Актуальний прайс-лист у вкладенні (XLSX).</p>
        <p style="color:#6B7280;font-size:12px;margin:8px 0 0">Дата: ${new Date().toLocaleDateString('uk-UA')}</p>
      </div>
    </div>`,
    attachments: [{
      filename: `pricelist_${date}.xlsx`,
      content:  buf.toString('base64'),
    }],
  });

  if (error) {
    console.error('[prices/email] resend error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
