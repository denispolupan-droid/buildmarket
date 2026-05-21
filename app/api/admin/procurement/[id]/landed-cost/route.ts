import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: poId } = await params;

  const body = await req.json() as {
    costs:  { cost_type: string; description?: string; amount: number }[];
    method: 'by_cost' | 'by_qty' | 'equal';
  };

  if (!body.costs?.length) return NextResponse.json({ error: 'Вкажіть хоча б одну статтю витрат' }, { status: 400 });
  if (!['by_cost','by_qty','equal'].includes(body.method)) return NextResponse.json({ error: 'Невірний метод розподілу' }, { status: 400 });

  // Find the confirmed receipt linked to this PO
  const { data: receipt } = await db
    .from('acc_documents')
    .select('id, total_cost')
    .eq('parent_doc_id', poId)
    .eq('status', 'confirmed')
    .in('doc_type', ['receipt', 'stock_in'])
    .single();

  if (!receipt) return NextResponse.json({ error: 'Прихід товару не знайдено. Спочатку оформіть прихід.' }, { status: 404 });

  // Check if batches exist
  const { count: batchCount } = await db
    .from('stock_batches')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', receipt.id);

  if ((batchCount ?? 0) === 0) return NextResponse.json({ error: 'FIFO партії не знайдено для цього приходу' }, { status: 404 });

  // Insert cost lines
  const costLines = body.costs
    .filter(c => c.amount > 0)
    .map(c => ({
      document_id:  receipt.id,
      cost_type:    c.cost_type,
      description:  c.description ?? null,
      amount:       c.amount,
      distributed:  false,
    }));

  const { error: insertErr } = await db.from('landed_cost_lines').insert(costLines);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Apply distribution via SQL function
  const { data: totalDistributed, error: fnErr } = await db
    .rpc('apply_landed_costs', { p_document_id: receipt.id, p_method: body.method });

  if (fnErr) return NextResponse.json({ error: fnErr.message }, { status: 500 });

  // Записуємо кожну статтю витрат окремо в expenses + money_entries
  const today = new Date().toISOString().slice(0, 10);

  // Маппінг типу витрати → тип рахунку в леджері
  const expenseAccountMap: Record<string, string> = {
    delivery:  'logistics',
    loading:   'loading',
    customs:   'customs',
    packaging: 'packaging',
    broker:    'customs',
    other:     'opex',
  };

  const expenseInserts = [];
  for (const cost of body.costs.filter(c => c.amount > 0)) {
    const accountType = expenseAccountMap[cost.cost_type] ?? 'opex';

    // Записуємо в money_entries (debit expense, credit bank/payable)
    const { data: txnId } = await db.rpc('record_money_txn', {
      p_debit_account:  accountType,
      p_credit_account: 'bank',
      p_debit_party:    null,
      p_credit_party:   null,
      p_amount:         cost.amount,
      p_business_date:  today,
      p_doc_id:         receipt.id,
      p_doc_type:       'landed_cost',
      p_description:    cost.description ?? `Landed cost: ${cost.cost_type}`,
      p_created_by:     user.email,
    });

    expenseInserts.push({
      expense_type:   accountType,
      description:    cost.description ?? `Landed cost: ${cost.cost_type}`,
      amount:         cost.amount,
      payment_method: 'bank',
      source:         'landed_cost',
      source_id:      receipt.id,
      txn_id:         txnId ?? null,
      business_date:  today,
      created_by:     user.email,
    });
  }

  if (expenseInserts.length > 0) {
    await db.from('expenses').insert(expenseInserts);
  }

  return NextResponse.json({ ok: true, receiptId: receipt.id, totalDistributed });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: poId } = await params;

  const { data: receipt } = await db
    .from('acc_documents')
    .select('id, landed_cost_total, landed_cost_method, total_cost')
    .eq('parent_doc_id', poId)
    .eq('status', 'confirmed')
    .single();

  if (!receipt) return NextResponse.json({ costs: [], receipt: null });

  const { data: costs } = await db
    .from('landed_cost_lines')
    .select('*')
    .eq('document_id', receipt.id)
    .order('created_at');

  return NextResponse.json({ costs: costs ?? [], receipt });
}
