import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { recordCustomerPayment, recordAdvanceReceived } from '../../../../lib/accounting/money';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
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
    specialCounterparty,
  } = await req.json() as {
    contractId?:   string;
    customerId?:   string;
    amount:        number;
    paymentMethod: 'bank' | 'cash' | 'acquiring';
    businessDate:  string;
    description?:  string;
    isAdvance?:    boolean;
    /** Виплата від спец-дебітора без договору: НП (COD) або маркетплейс */
    specialCounterparty?: 'np:cod' | 'mp:prom' | 'mp:rozetka';
  };

  const SPECIAL = { 'np:cod': 'Виплата НП (наложені платежі)', 'mp:prom': 'Виплата Prom.ua', 'mp:rozetka': 'Виплата Rozetka' } as const;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }
  if (specialCounterparty && !(specialCounterparty in SPECIAL)) {
    return NextResponse.json({ error: 'Невірний контрагент' }, { status: 400 });
  }

  // Виплата від спец-дебітора: закриває дебіторку np:cod / mp:* (створену
  // виручкою продажів без customer_id) — DR bank / CR customer(спец-контрагент).
  if (specialCounterparty) {
    try {
      const txnId = await recordCustomerPayment({
        customerId:     specialCounterparty,
        amount,
        paymentMethod,
        businessDate,
        description:    description || SPECIAL[specialCounterparty],
        createdBy:      user.email,
        idempotencyKey: `special-payment:${specialCounterparty}:${businessDate}:${amount}:${Date.now()}`,
      });
      return NextResponse.json({ ok: true, txnId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Помилка запису оплати';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!contractId || !customerId) {
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
