import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = req.nextUrl.searchParams.get('template');
  if (template) {
    const wb = XLSX.utils.book_new();
    const data = [
      ['sku', 'name', 'brand', 'category_slug', 'product_type', 'color', 'volume', 'pack_qty', 'min_order', 'price_unit', 'price_retail', 'stock_qty', 'bc', 'ac', 'description'],
      ['EXAMPLE-001', 'Приклад товару', 'BrandName', 'sealants', 'Силіконовий герметик', 'Білий', '280 мл', 1, 1, 100, 150, 50, '#FFFFFF', '#1E3A5F', 'Опис товару'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="products_template.xlsx"',
      },
    });
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const isPreview = formData.get('preview') === 'true';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);

  if (isPreview) {
    return NextResponse.json({ preview: rows.slice(0, 10) });
  }

  const results = { success: 0, errors: [] as { row: number; sku: string; error: string }[] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = String(row.sku ?? '').trim();
    const name = String(row.name ?? '').trim();
    const brand = String(row.brand ?? '').trim();

    if (!sku || !name || !brand) {
      results.errors.push({ row: i + 2, sku, error: 'Відсутній sku, name або brand' });
      continue;
    }

    const product: Record<string, unknown> = {
      sku,
      name,
      brand,
      category_slug: row.category_slug || null,
      product_type: row.product_type || null,
      color: row.color || null,
      volume: row.volume || null,
      pack_qty: Number(row.pack_qty) || 1,
      min_order: Number(row.min_order) || 1,
      description: row.description || null,
      bc: row.bc || '#FFFFFF',
      ac: row.ac || '#333333',
      is_active: true,
    };

    const stock: Record<string, unknown> = {
      sku,
      price_unit: Number(row.price_unit) || 0,
      price_retail: Number(row.price_retail) || null,
      stock_qty: Number(row.stock_qty) || 0,
      stock_status: Number(row.stock_qty) > 0 ? 'in_stock' : 'out_of_stock',
    };

    try {
      const { data: existing } = await serviceClient
        .from('products')
        .select('sku')
        .eq('sku', sku)
        .single();

      if (existing) {
        const { error: updateError } = await serviceClient
          .from('products')
          .update(product)
          .eq('sku', sku);

        if (updateError) {
          results.errors.push({ row: i + 2, sku, error: updateError.message });
          continue;
        }
      } else {
        const { error: insertError } = await serviceClient
          .from('products')
          .insert(product);

        if (insertError) {
          results.errors.push({ row: i + 2, sku, error: insertError.message });
          continue;
        }
      }

      await serviceClient
        .from('product_stock')
        .upsert(stock, { onConflict: 'sku' });

      results.success++;
    } catch (err) {
      results.errors.push({ row: i + 2, sku, error: String(err) });
    }
  }

  return NextResponse.json(results);
}
