import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireStaff } from '../../../../../lib/auth-guard';
import { recordTxn } from '../../../../../lib/accounting/money';

// Переказ між власними грошовими рахунками (напр. NovaPay → Монобанк, або внесення/зняття
// готівки). Проводка: DR <куди> / CR <звідки>. Обидві сторони — грошові рахунки, тому в
// P&L не впливає (тільки Cash Flow — рух між рахунками). Монобанк = 'bank'.
const MONEY_ACCOUNTS = ['bank', 'acquiring', 'novapay', 'cash'] as const;
type MoneyAccount = typeof MONEY_ACCOUNTS[number];

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    from?: string; to?: string; amount?: number; business_date?: string; note?: string;
  };
  const from = body.from as MoneyAccount;
  const to   = body.to   as MoneyAccount;
  const amount = Number(body.amount);

  if (!MONEY_ACCOUNTS.includes(from) || !MONEY_ACCOUNTS.includes(to)) {
    return NextResponse.json({ error: 'Невірний рахунок' }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: 'Рахунки мають відрізнятися' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });
  }
  const bizDate = body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
    ? body.business_date
    : new Date().toISOString().slice(0, 10);

  const LABEL: Record<MoneyAccount, string> = { bank: 'Монобанк', acquiring: 'Монобанк', novapay: 'НоваПей', cash: 'Каса' };

  const txnId = await recordTxn({
    debitAccount:   to,
    creditAccount:  from,
    amount,
    businessDate:   bizDate,
    docType:        'transfer',
    description:    body.note?.trim() || `Переказ ${LABEL[from]} → ${LABEL[to]}`,
    idempotencyKey: `transfer:${randomUUID()}`,
    createdBy:      auth.user.email ?? 'admin',
    meta:           { manual: true, transfer: true },
  });

  return NextResponse.json({ ok: true, txn_id: txnId });
}
