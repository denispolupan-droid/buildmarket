import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

// POST /api/admin/receipts/[id]/landed-cost
// Додає витрати (Landed Cost) безпосередньо до приходного ордера,
// без прив'язки до ЗП — для приходів створених без замовлення.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: receiptId } = await params;

  const body = await req.json() as {
    costs:         { cost_type: string; description?: string; amount: number }[];
    method:        'by_cost' | 'by_qty' | 'equal';
    paymentMethod?: 'cash' | 'bank';
  };

  const paymentMethod = body.paymentMethod === 'cash' ? 'cash' : 'bank';

  if (!body.costs?.length) return NextResponse.json({ error: 'Вкажіть хоча б одну статтю витрат' }, { status: 400 });
  if (!['by_cost','by_qty','equal'].includes(body.method)) return NextResponse.json({ error: 'Невірний метод розподілу' }, { status: 400 });

  // Перевіряємо що прихід існує і підтверджений
  const { data: receipt } = await db
    .from('acc_documents')
    .select('id, total_cost, status, doc_type, doc_number')
    .eq('id', receiptId)
    .in('doc_type', ['receipt', 'stock_in'])
    .single();

  if (!receipt) return NextResponse.json({ error: 'Прихідний ордер не знайдено' }, { status: 404 });
  if (receipt.status !== 'confirmed') return NextResponse.json({ error: 'Прихід не проведено' }, { status: 400 });

  // Перевіряємо FIFO-партії
  const { count: batchCount } = await db
    .from('stock_batches')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', receiptId);

  if ((batchCount ?? 0) === 0) return NextResponse.json({ error: 'FIFO партії не знайдено для цього приходу' }, { status: 404 });

  // Вставляємо рядки витрат
  const costLines = body.costs
    .filter(c => c.amount > 0)
    .map(c => ({
      document_id:  receiptId,
      cost_type:    c.cost_type,
      description:  c.description ?? null,
      amount:       c.amount,
      distributed:  false,
    }));

  const { error: insertErr } = await db.from('landed_cost_lines').insert(costLines);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Розподіляємо через SQL функцію
  const { data: totalDistributed, error: fnErr } = await db
    .rpc('apply_landed_costs', { p_document_id: receiptId, p_method: body.method });

  if (fnErr) return NextResponse.json({ error: fnErr.message }, { status: 500 });

  // Записуємо витрати в expenses + money_entries
  const today = new Date().toISOString().slice(0, 10);
  const expenseAccountMap: Record<string, string> = {
    delivery: 'logistics', loading: 'loading', customs: 'customs',
    packaging: 'packaging', broker: 'customs', other: 'opex',
  };
  const costTypeLabel: Record<string, string> = {
    delivery: 'Доставка', loading: 'Навантаж./розвантаж.', customs: 'Мито',
    packaging: 'Пакування', broker: 'Брокер', other: 'Інше',
  };
  const docRef = receipt.doc_number ? ` — ${receipt.doc_number}` : '';

  const expenseInserts = [];
  for (const cost of body.costs.filter(c => c.amount > 0)) {
    const accountType = expenseAccountMap[cost.cost_type] ?? 'opex';
    const description = cost.description
      ? `${cost.description}${docRef}`
      : `${costTypeLabel[cost.cost_type] ?? cost.cost_type}${docRef}`;
    const { data: txnId } = await db.rpc('record_money_txn', {
      p_debit_account:  accountType,
      p_credit_account: paymentMethod,
      p_debit_party:    null,
      p_credit_party:   null,
      p_amount:         cost.amount,
      p_business_date:  today,
      p_doc_id:         receiptId,
      p_doc_type:       'landed_cost',
      p_description:    description,
      p_created_by:     user.email,
    });
    expenseInserts.push({
      expense_type:   accountType,
      description,
      amount:         cost.amount,
      payment_method: paymentMethod,
      source:         'landed_cost',
      source_id:      receiptId,
      txn_id:         txnId ?? null,
      business_date:  today,
      created_by:     user.email,
    });
  }
  if (expenseInserts.length > 0) await db.from('expenses').insert(expenseInserts);

  return NextResponse.json({ ok: true, receiptId, totalDistributed });
}

// GET /api/admin/receipts/[id]/landed-cost — поточні LC для прихідного ордера
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: receiptId } = await params;

  const { data: costs } = await db
    .from('landed_cost_lines')
    .select('*')
    .eq('document_id', receiptId)
    .order('created_at');

  return NextResponse.json({ costs: costs ?? [] });
}
