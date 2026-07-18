import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';

const db = createServiceClient();

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customerId');
  const contractId = searchParams.get('contractId');
  const dateFrom   = searchParams.get('dateFrom');
  const dateTo     = searchParams.get('dateTo');

  if (!customerId && !contractId) {
    return NextResponse.json({ error: 'customerId або contractId обов\'язковий' }, { status: 400 });
  }

  // ── Вхідний залишок: сума всіх customer-записів ДО dateFrom ──────────────────
  let openingQuery = db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'customer');

  if (contractId)       openingQuery = openingQuery.eq('contract_id', contractId);
  else if (customerId)  openingQuery = openingQuery.eq('counterparty_id', customerId);
  if (dateFrom)         openingQuery = openingQuery.lt('business_date', dateFrom);

  const { data: openingRows } = await openingQuery;
  const opening = (openingRows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // ── Транзакції за період ──────────────────────────────────────────────────────
  let txnQuery = db
    .from('ar_transactions')
    .select('*')
    .order('business_date', { ascending: true })
    .order('created_at',    { ascending: true });

  if (contractId)       txnQuery = txnQuery.eq('contract_id', contractId);
  else if (customerId)  txnQuery = txnQuery.eq('customer_id', customerId);
  if (dateFrom)         txnQuery = txnQuery.gte('business_date', dateFrom);
  if (dateTo)           txnQuery = txnQuery.lte('business_date', dateTo);

  const { data: rows, error } = await txnQuery.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Збагачуємо рядки номерами замовлень ─────────────────────────────────────
  const orderIds = [...new Set((rows ?? []).map((r: { order_id: string | null }) => r.order_id).filter(Boolean))] as string[];
  let orderNumberMap: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: orders } = await db
      .from('orders')
      .select('id, order_number')
      .in('id', orderIds);
    orderNumberMap = Object.fromEntries((orders ?? []).map((o: { id: string; order_number: number }) => [o.id, o.order_number]));
  }

  const enrichedRows = (rows ?? []).map((r: { order_id: string | null }) => ({
    ...r,
    order_number: r.order_id ? (orderNumberMap[r.order_id] ?? null) : null,
  }));

  return NextResponse.json({ opening, rows: enrichedRows });
}
