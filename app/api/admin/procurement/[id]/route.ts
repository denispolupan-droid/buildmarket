import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

// GET /api/admin/procurement/[id] — повертає PO з лініями (для відкриття чернетки в модалі)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const [{ data: doc }, { data: lines }, { data: products }] = await Promise.all([
    db.from('acc_documents')
      .select('id, doc_number, procurement_status, supplier_id, expected_date, notes, total_cost')
      .eq('id', id).single(),
    db.from('acc_document_lines')
      .select('sku, qty, cost_price')
      .eq('document_id', id)
      .order('sort_order'),
    db.from('suppliers').select('id, name, email').eq('is_active', true).order('name'),
  ]);

  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  const skus = (lines ?? []).map(l => l.sku);
  const { data: productNames } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((productNames ?? []).map(p => [p.sku, p]));

  return NextResponse.json({
    ...doc,
    suppliers: products ?? [],
    lines: (lines ?? []).map(l => ({
      sku:        l.sku,
      name:       nameMap.get(l.sku)?.name  ?? '',
      brand:      nameMap.get(l.sku)?.brand ?? '',
      qty:        l.qty,
      cost_price: Number(l.cost_price ?? 0),
      matched:    nameMap.has(l.sku),
    })),
  });
}

// DELETE /api/admin/procurement/[id] — видаляє чернетку PO
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents')
    .select('procurement_status, doc_type, doc_number')
    .eq('id', id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });
  if (doc.doc_type !== 'purchase_order') {
    return NextResponse.json({ error: 'Можна видаляти тільки PO' }, { status: 400 });
  }

  // Забороняємо видалення якщо є приходи товару (receipt / stock_in)
  const { count: receiptCount } = await db
    .from('acc_documents')
    .select('id', { count: 'exact', head: true })
    .eq('parent_doc_id', id)
    .neq('status', 'cancelled');

  if ((receiptCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `Неможливо видалити: є ${receiptCount} прихід(ів) товару. Спочатку скасуйте приходи.` },
      { status: 400 },
    );
  }

  const { error: linesErr } = await db.from('acc_document_lines').delete().eq('document_id', id);
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const { error: docErr } = await db.from('acc_documents').delete().eq('id', id);
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PUT /api/admin/procurement/[id] — оновлює існуючу чернетку PO
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  // Перевіряємо що документ існує і є чернеткою
  const { data: doc } = await db
    .from('acc_documents')
    .select('id, procurement_status, doc_type')
    .eq('id', id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });
  if (doc.doc_type !== 'purchase_order') return NextResponse.json({ error: 'Не є PO' }, { status: 400 });
  // NULL = legacy docs created before procurement_status was populated (treat as draft)
  if (doc.procurement_status !== 'draft' && doc.procurement_status !== null) {
    return NextResponse.json({ error: 'Можна редагувати тільки чернетки' }, { status: 400 });
  }

  const body = await req.json() as {
    supplier_id:    number;
    expected_date?: string;
    notes?:         string;
    conduct?:       boolean;  // одразу провести (procurement_status: 'new')
    lines: { sku: string; qty: number; cost_price: number }[];
  };

  if (!body.supplier_id || !body.lines?.length) {
    return NextResponse.json({ error: 'Постачальник і товари обов\'язкові' }, { status: 400 });
  }

  const total = body.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);

  // Оновлюємо заголовок документа
  const { error: docErr } = await db
    .from('acc_documents')
    .update({
      supplier_id:        body.supplier_id,
      expected_date:      body.expected_date ?? null,
      notes:              body.notes ?? null,
      total_amount:       total,
      total_cost:         total,
      ...(body.conduct ? { procurement_status: 'sent' } : {}),
    })
    .eq('id', id);

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  // Замінюємо рядки: видаляємо старі, вставляємо нові
  await db.from('acc_document_lines').delete().eq('document_id', id);

  const { data: warehouse } = await db
    .from('warehouses').select('id').eq('is_default', true).single();

  const newLines = body.lines.map((l, i) => ({
    document_id:      id,
    sku:              l.sku.trim(),
    qty:              l.qty,
    price:            0,
    cost_price:       l.cost_price,
    fulfillment_type: 'dropship' as const,
    supplier_id:      body.supplier_id,
    warehouse_id:     warehouse?.id ?? null,
    uom_factor:       1,
    exchange_rate:    1,
    sort_order:       i,
    meta:             {},
  }));

  const { error: linesErr } = await db.from('acc_document_lines').insert(newLines);
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  return NextResponse.json({ id, doc_number: doc.id });
}
