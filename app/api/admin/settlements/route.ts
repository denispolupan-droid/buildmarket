import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';

const db = createServiceClient();

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const contractId = searchParams.get('contractId');
  const dateFrom   = searchParams.get('dateFrom');
  const dateTo     = searchParams.get('dateTo');

  // Opening balance: sum of all customer entries BEFORE dateFrom
  let openingQuery = db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'customer');
  if (contractId) openingQuery = openingQuery.eq('contract_id', contractId);
  if (dateFrom)   openingQuery = openingQuery.lt('business_date', dateFrom);

  const { data: openingRows } = await openingQuery;
  const opening = (openingRows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transactions in period
  let txnQuery = db
    .from('ar_transactions')
    .select('*')
    .order('business_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (contractId) txnQuery = txnQuery.eq('contract_id', contractId);
  if (dateFrom)   txnQuery = txnQuery.gte('business_date', dateFrom);
  if (dateTo)     txnQuery = txnQuery.lte('business_date', dateTo);

  const { data: rows, error } = await txnQuery.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ opening, rows: rows ?? [] });
}
