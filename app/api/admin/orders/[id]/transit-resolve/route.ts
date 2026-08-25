import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { resolveTransit, type TransitDecision } from '../../../../../../lib/accounting/transit';

// Доля товару з посилки, яку покупець не забрав.
//
// З міграції 103 борг перед постачальником виникає при відвантаженні, тож після
// відмови товар висить на рахунку «в дорозі» і чекає рішення людини: поїхав назад
// постачальнику (борг знімаємо) чи лишився в нас (оприбутковуємо, борг лишається).
// Автоматично вирішити не можна — це фізичний факт, а не стан у базі.

// Що зараз висить у дорозі по замовленню — щоб картка показала блок рішення
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createServiceClient();

  const { data: entries } = await db
    .from('money_entries')
    .select('doc_id, amount')
    .eq('order_id', id)
    .eq('account_type', 'inventory_transit')
    .limit(1000);

  const byDoc = new Map<string, number>();
  for (const e of entries ?? []) {
    const k = String(e.doc_id);
    byDoc.set(k, (byDoc.get(k) ?? 0) + Number(e.amount));
  }
  const open = [...byDoc.entries()]
    .filter(([, net]) => net > 0.005)
    .map(([docId, net]) => ({ docId, amount: Math.round(net * 100) / 100 }));

  return NextResponse.json({
    ok: true,
    parcels: open,
    total: Math.round(open.reduce((s, p) => s + p.amount, 0) * 100) / 100,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as { decision?: TransitDecision; doc_id?: string };
  if (body.decision !== 'to_supplier' && body.decision !== 'keep') {
    return NextResponse.json({ error: 'Не вказано, куди подівся товар' }, { status: 400 });
  }

  // Якщо посилку не вказали — вирішуємо по всіх відкритих цього замовлення
  let docIds: string[];
  if (body.doc_id) {
    docIds = [body.doc_id];
  } else {
    const { data: entries } = await db
      .from('money_entries')
      .select('doc_id, amount')
      .eq('order_id', id)
      .eq('account_type', 'inventory_transit')
      .limit(1000);
    const byDoc = new Map<string, number>();
    for (const e of entries ?? []) {
      const k = String(e.doc_id);
      byDoc.set(k, (byDoc.get(k) ?? 0) + Number(e.amount));
    }
    docIds = [...byDoc.entries()].filter(([, net]) => net > 0.005).map(([docId]) => docId);
  }

  if (!docIds.length) {
    return NextResponse.json({ error: 'По цьому замовленню товар у дорозі не висить' }, { status: 409 });
  }

  let total = 0;
  for (const docId of docIds) {
    const { amount } = await resolveTransit({
      docId,
      decision:  body.decision,
      createdBy: auth.user.email ?? 'admin',
    });
    total += amount;
  }

  return NextResponse.json({
    ok: true,
    decision: body.decision,
    amount: Math.round(total * 100) / 100,
  });
}
