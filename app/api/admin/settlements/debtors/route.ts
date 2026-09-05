import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { isSpecialDebtor, SPECIAL_DEBTOR_LABEL } from '../../../../../lib/accounting/sale-party';

const db = createServiceClient();

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ar_balances — агрегований вид: SUM(money_entries) де account_type='customer' по
  // counterparty_id (міграція 110); договір — атрибут. Службові дебітори теж тут.
  const { data, error } = await db
    .from('ar_balances')
    .select('customer_id, customer_name, contract_id, contract_number, balance, credit_limit, credit_days, contract_status, currency')
    .gt('balance', 0.01)
    .order('balance', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Остання операція по кожному клієнту (для розрахунку прострочення)
  const customerIds = [...new Set((data ?? []).map((r: { customer_id: string }) => r.customer_id))];
  const lastOpMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: lastOps } = await db
      .from('ar_transactions')
      .select('customer_id, business_date')
      .in('customer_id', customerIds)
      .eq('doc_type', 'sale')
      .order('business_date', { ascending: false });

    // Беремо найстарішу неоплачену дату відвантаження по клієнту
    for (const op of lastOps ?? []) {
      if (!lastOpMap[op.customer_id]) {
        lastOpMap[op.customer_id] = op.business_date;
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const debtors = (data ?? []).map((r: {
    customer_id: string; customer_name: string | null;
    contract_id: string | null; contract_number: string | null;
    balance: number; credit_limit: number; credit_days: number;
    contract_status: string; currency: string;
  }) => {
    // Службові дебітори (np:cod, mp:*) — транзит НП і площадок: у них немає
    // «прострочення», лише сума до виплати/сверки з випискою.
    if (isSpecialDebtor(r.customer_id)) {
      return {
        ...r,
        customer_name:   SPECIAL_DEBTOR_LABEL[r.customer_id],
        contract_status: 'special',
        last_ship_date:  lastOpMap[r.customer_id] ?? null,
        days_overdue:    0,
      };
    }
    const lastShipDate = lastOpMap[r.customer_id] ?? null;
    const daysOverdue = lastShipDate
      ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(lastShipDate).getTime()) / 86400000) - (r.credit_days ?? 0))
      : 0;
    return { ...r, last_ship_date: lastShipDate, days_overdue: daysOverdue };
  });

  const total = debtors.reduce((s: number, r: { balance: number }) => s + Number(r.balance), 0);

  return NextResponse.json({ debtors, total });
}
