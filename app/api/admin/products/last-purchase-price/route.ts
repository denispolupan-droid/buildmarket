import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createServiceClient();

// GET /api/admin/products/last-purchase-price?skus=sku1,sku2
// Повертає останню закупівельну ціну по кожному SKU
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const skusParam = req.nextUrl.searchParams.get('skus') ?? '';
  const skus = skusParam.split(',').map(s => s.trim()).filter(Boolean);
  if (!skus.length) return NextResponse.json({});

  const { data } = await db
    .from('acc_document_lines')
    .select('sku, cost_price, document:document_id(doc_date)')
    .in('sku', skus)
    .eq('document.doc_type', 'purchase_order')
    .eq('document.status', 'confirmed')
    .order('document(doc_date)', { ascending: false });

  // Беремо найсвіжішу ціну по кожному SKU
  const result: Record<string, { last_price: number; doc_date: string }> = {};
  for (const row of data ?? []) {
    if (!row.sku || result[row.sku]) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docDate = (row.document as any)?.doc_date;
    if (docDate) result[row.sku] = { last_price: Number(row.cost_price), doc_date: docDate };
  }

  return NextResponse.json(result);
}
