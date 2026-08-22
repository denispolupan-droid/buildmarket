import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn } from '../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../lib/accounting/documents';
import { supplierCharges } from '../../../../../lib/accounting/supplier-debts';
import { planAllocation, validateManual } from '../../../../../lib/accounting/allocation';

// GET — що саме винні цьому постачальнику: список боргів із залишками.
// Потрібен вікну оплати, щоб показати, на що ляже сума.
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const supplierId = Number(req.nextUrl.searchParams.get('supplier_id'));
  if (typeof supplierId !== 'number' || !Number.isInteger(supplierId)) {
    return NextResponse.json({ error: 'Невірний постачальник' }, { status: 400 });
  }

  return NextResponse.json({ charges: await supplierCharges(supplierId) });
}

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
    /** Як рознести оплату по боргах: найстаріші / найновіші / вручну */
    allocation_mode?: 'oldest' | 'newest' | 'manual';
    allocations?: { charge_id: string; amount: number }[];
  };

  const supplierId  = body.supplier_id;
  const amount      = Number(body.amount);
  const paymentMode = body.payment_mode === 'cash' ? 'cash' : 'transfer';

  if (typeof supplierId !== 'number' || !Number.isInteger(supplierId)) {
    return NextResponse.json({ error: 'Невірний постачальник' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });

  const db = createServiceClient();
  const { data: supplier } = await db.from('suppliers').select('id, name').eq('id', supplierId).single();
  if (!supplier) return NextResponse.json({ error: 'Постачальника не знайдено' }, { status: 404 });

  const bizDate = body.payment_date && /^\d{4}-\d{2}-\d{2}$/.test(body.payment_date)
    ? body.payment_date
    : new Date().toISOString().slice(0, 10);

  // Рознесення рахуємо ДО проводки: якщо людина вказала руками щось неможливе
  // (більше, ніж лишилось по накладній), краще відмовити зараз, ніж провести
  // оплату й лишити її «наполовину рознесеною».
  const mode = body.allocation_mode ?? 'oldest';
  const charges = await supplierCharges(supplierId);
  const planned = mode === 'manual'
    ? validateManual(charges, amount, (body.allocations ?? []).map(a => ({ chargeId: a.charge_id, amount: Number(a.amount) })))
    : { ok: true as const, plan: planAllocation(charges, amount, mode) };
  if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: 400 });

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

  // Проводку щойно створили — знаходимо її, щоб прив'язати рознесення.
  // Шукаємо за ідемпотентним ключем: він унікальний саме для цієї оплати.
  const { data: paymentEntry } = await db
    .from('money_entries')
    .select('id')
    .eq('idempotency_key', `supplier_payment:${voucher.id}`)
    .eq('account_type', 'supplier')
    .maybeSingle();

  let allocatedCount = 0;
  if (paymentEntry && planned.plan.lines.length) {
    const { error: allocErr } = await db.from('supplier_payment_allocations').insert(
      planned.plan.lines.map(l => ({
        payment_entry_id: paymentEntry.id,
        charge_entry_id:  l.chargeId,
        amount:           l.amount,
        created_by:       auth.user.email ?? 'admin',
      })),
    );
    // Оплата вже проведена і в балансі — валити весь запит через невдале
    // рознесення не можна: гроші пішли, а користувач побачив би «помилку».
    // Кажемо про це у відповіді, рознести можна повторно.
    if (allocErr) {
      return NextResponse.json({
        ok: true, doc_number: voucher.doc_number, allocated: 0,
        warning: 'Оплату проведено, але рознести по накладних не вдалося: ' + allocErr.message,
      });
    }
    allocatedCount = planned.plan.lines.length;
  }

  return NextResponse.json({
    ok: true,
    doc_number: voucher.doc_number,
    allocated: allocatedCount,
    unallocated: planned.plan.unallocated,
  });
}
