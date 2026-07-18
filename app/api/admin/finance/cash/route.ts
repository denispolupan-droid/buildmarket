import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { recordTxn } from '../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../lib/accounting/documents';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
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
    const voucherType = direction === 'in' ? 'cash_in' as const : 'cash_out' as const;
    const voucher = await createPaymentVoucher({
      doc_type:      voucherType,
      amount,
      business_date,
      created_by:    user.email ?? 'admin',
      meta:          { category: category ?? 'other', direction, manual: true },
    });

    const txnId = await recordTxn({
      debitAccount:  direction === 'in'  ? 'cash'       : 'correction',
      creditAccount: direction === 'in'  ? 'correction' : 'cash',
      amount,
      businessDate:  business_date,
      docId:         voucher.id,
      docType:       voucherType,
      description,
      createdBy:     user.email,
      meta:          { category: category ?? 'other', manual: true },
    });

    return NextResponse.json({ ok: true, txnId, voucher_id: voucher.id, doc_number: voucher.doc_number });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Помилка запису';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
