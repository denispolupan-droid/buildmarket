import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';
import { parseBody, z } from '../../../../../lib/validate';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

async function _PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req, z.object({
    sku:              z.string().trim().min(1, 'sku обовʼязковий'),
    prom_markup_pct:  z.number().min(-100).max(1000).nullable().optional(),
    price_wholesale:  z.number().min(0).max(10_000_000).nullable().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const { sku, prom_markup_pct, price_wholesale } = parsed.data;

  const [productRes, stockRes] = await Promise.all([
    prom_markup_pct !== undefined
      ? db.from('products').update({ prom_markup_pct }).eq('sku', sku)
      : Promise.resolve({ error: null }),
    price_wholesale !== undefined
      ? db.from('product_stock').update({ price_wholesale }).eq('sku', sku)
      : Promise.resolve({ error: null }),
  ]);

  if (productRes.error) return NextResponse.json({ error: productRes.error.message }, { status: 500 });
  if (stockRes.error)   return NextResponse.json({ error: stockRes.error.message },   { status: 500 });

  // Роут міняє products і product_stock — те саме, що решта редакторів ціни,
  // тож і тег той самий. Без нього зміна чекала кінця TTL кешу листингів.
  revalidateTag('products', 'max');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApi('admin/products/prom-price', _PATCH);
