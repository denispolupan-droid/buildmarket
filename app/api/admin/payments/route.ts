import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { recordCustomerPayment, recordAdvanceReceived } from '../../../../lib/accounting/money';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const {
    contractId,
    customerId,
    amount,
    paymentMethod,
    businessDate,
    description,
    isAdvance,
  } = await req.json() as {
    contractId:    string;
    customerId:    string;
    amount:        number;
    paymentMethod: 'bank' | 'cash' | 'acquiring';
    businessDate:  string;
    description?:  string;
    isAdvance?:    boolean;
  };

  if (!contractId || !customerId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  try {
    const idempotencyKey = `payment:${contractId}:${businessDate}:${amount}:${Date.now()}`;

    let txnId: string;
    if (isAdvance) {
      txnId = await recordAdvanceReceived({
        customerId,
        contractId,
        amount,
        paymentMethod,
        businessDate,
        createdBy:      user.email,
        idempotencyKey,
      });
    } else {
      txnId = await recordCustomerPayment({
        customerId,
        contractId,
        amount,
        paymentMethod,
        businessDate,
        description:    description || 'Оплата по договору',
        createdBy:      user.email,
        idempotencyKey,
      });
    }

    return NextResponse.json({ ok: true, txnId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Помилка запису оплати';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
