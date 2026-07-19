import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn } from '../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../lib/accounting/documents';

// Фіксація оплати постачальнику зі сторінки взаєморозрахунків (/admin/finance/payables).
// На відміну від /api/admin/procurement/[id]/add-payment, не прив'язана до конкретного
// приходу — закриває загальний борг (у т.ч. дропшип-борг, який виникає без PO).
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    supplier_id?:  number;
    amount?:       number;
    payment_mode?: 'transfer' | 'cash';
    payment_date?: string;
    note?:         string;
  };

  const supplierId  = body.supplier_id;
  const amount      = Number(body.amount);
  const paymentMode = body.payment_mode === 'cash' ? 'cash' : 'transfer';

  if (!Number.isInteger(supplierId)) return NextResponse.json({ error: 'Невірний постачальник' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });

  const db = createServiceClient();
  const { data: supplier } = await db.from('suppliers').select('id, name').eq('id', supplierId).single();
  if (!supplier) return NextResponse.json({ error: 'Постачальника не знайдено' }, { status: 404 });

  const bizDate = body.payment_date && /^\d{4}-\d{2}-\d{2}$/.test(body.payment_date)
    ? body.payment_date
    : new Date().toISOString().slice(0, 10);

  const voucher = await createPaymentVoucher({
    doc_type:      'supplier_payment',
    supplier_id:   supplierId,
    amount,
    business_date: bizDate,
    created_by:    auth.user.email ?? 'admin',
    meta:          { payment_mode: paymentMode, source: 'payables' },
  });

  await recordTxn({
    debitAccount:   'supplier',
    debitParty:     String(supplierId),
    creditAccount:  paymentMode === 'cash' ? 'cash' : 'bank',
    creditParty:    null,
    amount,
    businessDate:   bizDate,
    docId:          voucher.id,
    docType:        'supplier_payment',
    description:    `${body.note?.trim() ? body.note.trim() + ': ' : ''}Оплата постачальнику ${supplier.name} (${voucher.doc_number})`,
    idempotencyKey: `supplier_payment:${voucher.id}`,
    createdBy:      auth.user.email,
    meta:           { payment_mode: paymentMode, source: 'payables' },
  });

  return NextResponse.json({ ok: true, doc_number: voucher.doc_number });
}
