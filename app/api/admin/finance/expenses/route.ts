import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn, type AccountType } from '../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../lib/accounting/documents';

// Ручне додавання операційної витрати (бэклог аудиту: раніше витрати потрапляли
// лише автоматично — landed cost при прийманні та касові РКО).
// Проводка: DR <рахунок витрати> / CR bank|cash; для готівки додатково
// створюється РКО-ваучер (щоб витрата була видна в касовій книзі з номером).

const EXPENSE_ACCOUNTS: AccountType[] = [
  'logistics', 'loading', 'customs', 'packaging',
  'rent', 'salary', 'marketing', 'opex',
];

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as {
    expense_type?:   string;
    amount?:         number;
    description?:    string;
    counterparty?:   string;
    payment_method?: 'bank' | 'cash' | 'acquiring' | 'novapay';
    business_date?:  string;
  };

  const expenseType = body.expense_type as AccountType;
  const amount = Number(body.amount);
  const PAY_ACCOUNTS = ['bank', 'cash', 'acquiring', 'novapay'] as const;
  const method: 'bank' | 'cash' | 'acquiring' | 'novapay' =
    PAY_ACCOUNTS.includes(body.payment_method as typeof PAY_ACCOUNTS[number]) ? body.payment_method! : 'bank';

  if (!EXPENSE_ACCOUNTS.includes(expenseType)) {
    return NextResponse.json({ error: 'Невірний тип витрати' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'Опис обов\'язковий' }, { status: 400 });
  }
  const bizDate = body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
    ? body.business_date
    : new Date().toISOString().slice(0, 10);

  const createdBy = auth.user.email ?? 'admin';

  // Готівкова витрата — РКО-ваучер, щоб вона мала номер у касовій книзі
  const voucher = method === 'cash'
    ? await createPaymentVoucher({
        doc_type:      'cash_out',
        amount,
        business_date: bizDate,
        created_by:    createdBy,
        meta:          { category: expenseType, manual: true, source: 'expense' },
      })
    : null;

  const txnId = await recordTxn({
    debitAccount:   expenseType,
    creditAccount:  method,
    amount,
    businessDate:   bizDate,
    docId:          voucher?.id,
    docType:        'expense',
    description:    body.description.trim(),
    idempotencyKey: `manual-expense:${voucher?.id ?? randomUUID()}`,
    createdBy,
    meta:           { manual: true, counterparty: body.counterparty?.trim() || undefined },
  });

  const { error: insErr } = await db.from('expenses').insert({
    expense_type:   expenseType,
    description:    body.description.trim(),
    counterparty:   body.counterparty?.trim() || null,
    amount,
    payment_method: method,
    source:         'manual',
    source_id:      voucher?.id ?? null,
    txn_id:         txnId,
    business_date:  bizDate,
    created_by:     createdBy,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, txn_id: txnId, voucher: voucher?.doc_number ?? null });
}
