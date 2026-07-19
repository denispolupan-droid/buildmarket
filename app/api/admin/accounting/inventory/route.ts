import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { createDocument, confirmDocument } from '../../../../../lib/accounting/documents';

// Інвентаризація складу (документ doc_type='inventory').
// GET  ?warehouse_id= — планові залишки складу для перерахунку (план = qty_total).
// POST — приймає фактичні кількості, створює документ із дельта-рядками
//        (факт − план), проводить: нестача списується за FIFO, надлишок
//        оприбутковується новою партією; гроші йдуть на рахунок «Відхилення».
//        Відомість (план/факт/різниця) зберігається в meta документа.

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();

  const warehouseId = parseInt(req.nextUrl.searchParams.get('warehouse_id') ?? '');

  const { data: warehouses } = await db
    .from('warehouses')
    .select('id, name, warehouse_type, is_default')
    .eq('warehouse_type', 'physical')
    .order('id');

  if (isNaN(warehouseId)) {
    return NextResponse.json({ warehouses: warehouses ?? [], items: [] });
  }

  type BalRow = { sku: string; qty_total: number; qty_reserved: number; avg_cost: number };
  const balances = await fetchAllRows<BalRow>((f, t) => db
    .from('stock_balance')
    .select('sku, qty_total, qty_reserved, avg_cost')
    .eq('warehouse_id', warehouseId)
    .order('sku')
    .range(f, t));

  const skus = balances.map(b => b.sku);
  const names = new Map<string, { name: string; brand: string | null }>();
  for (let i = 0; i < skus.length; i += 500) {
    const { data } = await db.from('products').select('sku, name, brand').in('sku', skus.slice(i, i + 500));
    for (const p of data ?? []) names.set(p.sku, { name: p.name, brand: p.brand });
  }

  return NextResponse.json({
    warehouses: warehouses ?? [],
    items: balances.map(b => ({
      sku:      b.sku,
      name:     [names.get(b.sku)?.brand, names.get(b.sku)?.name].filter(Boolean).join(' ') || b.sku,
      plan:     Number(b.qty_total),
      reserved: Number(b.qty_reserved),
      avg_cost: Number(b.avg_cost ?? 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as {
    warehouse_id?: number;
    note?: string;
    lines?: { sku: string; fact: number }[];
  };
  const warehouseId = body.warehouse_id;
  if (!Number.isInteger(warehouseId)) return NextResponse.json({ error: 'Невірний склад' }, { status: 400 });
  if (!body.lines?.length) return NextResponse.json({ error: 'Немає рядків' }, { status: 400 });
  for (const l of body.lines) {
    if (!l.sku || !Number.isFinite(l.fact) || l.fact < 0) {
      return NextResponse.json({ error: `Невірний факт для ${l.sku}` }, { status: 400 });
    }
  }

  const { data: warehouse } = await db
    .from('warehouses').select('id, name, warehouse_type').eq('id', warehouseId).single();
  if (!warehouse || warehouse.warehouse_type !== 'physical') {
    return NextResponse.json({ error: 'Інвентаризація можлива лише для фізичного складу' }, { status: 400 });
  }

  // План — поточні залишки складу (авторитет — stock_balance, звірений інваріантом I1)
  type BalRow = { sku: string; qty_total: number; avg_cost: number };
  const balances = await fetchAllRows<BalRow>((f, t) => db
    .from('stock_balance')
    .select('sku, qty_total, avg_cost')
    .eq('warehouse_id', warehouseId)
    .range(f, t));
  const planMap = new Map(balances.map(b => [b.sku, { plan: Number(b.qty_total), cost: Number(b.avg_cost ?? 0) }]));

  // Відомість і дельта-рядки
  const sheet: { sku: string; plan: number; fact: number; delta: number; cost: number }[] = [];
  for (const l of body.lines) {
    const p = planMap.get(l.sku);
    if (!p) return NextResponse.json({ error: `${l.sku}: немає на складі (немає плану)` }, { status: 400 });
    const delta = Math.round((l.fact - p.plan) * 1000) / 1000;
    if (delta !== 0) sheet.push({ sku: l.sku, plan: p.plan, fact: l.fact, delta, cost: p.cost });
  }

  if (!sheet.length) {
    return NextResponse.json({ ok: true, no_diff: true, message: 'Розбіжностей немає — документ не потрібен' });
  }

  const createdBy = auth.user.email ?? 'admin';
  const doc = await createDocument({
    doc_type:     'inventory',
    warehouse_id: warehouse.id,
    notes:        `Інвентаризація складу «${warehouse.name}»${body.note?.trim() ? ` — ${body.note.trim()}` : ''}`,
    created_by:   createdBy,
    meta: {
      inventory_sheet: sheet,
      counted_lines:   body.lines.length,
    },
    lines: sheet.map(s => ({
      sku:              s.sku,
      qty:              s.delta,           // ± дельта: buildMovements(direction='inventory') розбере знак
      price:            0,
      cost_price:       s.cost,
      fulfillment_type: 'own' as const,
      warehouse_id:     warehouse.id,
    })),
  });

  await confirmDocument(doc.id, createdBy);

  const surplus  = sheet.filter(s => s.delta > 0).reduce((sum, s) => sum + s.delta * s.cost, 0);
  const shortage = sheet.filter(s => s.delta < 0).reduce((sum, s) => sum + Math.abs(s.delta) * s.cost, 0);

  return NextResponse.json({
    ok: true,
    doc_id:     doc.id,
    doc_number: doc.doc_number,
    diffs:      sheet.length,
    surplus_cost:  Math.round(surplus * 100) / 100,
    shortage_cost: Math.round(shortage * 100) / 100,
  });
}
