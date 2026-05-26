import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { recordTxn } from '../../../../../lib/accounting/money';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { direction, amount, description, category, business_date } = await req.json() as {
    direction:     'in' | 'out';
    amount:        number;
    description:   string;
    category?:     string;
    business_date: string;
  };

  if (!direction || !amount || amount <= 0 || !description || !business_date) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  try {
    const txnId = await recordTxn({
      // in  = ПКО: cash надходить, кредит — correction (інше джерело)
      // out = РКО: cash видається, дебет — correction (інші видатки)
      debitAccount:  direction === 'in'  ? 'cash'       : 'correction',
      creditAccount: direction === 'in'  ? 'correction' : 'cash',
      amount,
      businessDate: business_date,
      description,
      docType:      direction === 'in' ? 'cash_in' : 'cash_out',
      createdBy:    user.email,
      idempotencyKey: null,
      meta: { category: category ?? 'other', manual: true },
    });

    return NextResponse.json({ ok: true, txnId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Помилка запису';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
