import { NextRequest, NextResponse } from 'next/server';
import { recordTxn } from '../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../lib/accounting/documents';
import { requireStaff } from '../../../../../lib/auth-guard';
import { parseBody, zMoney, zYmd, zText, z } from '../../../../../lib/validate';
import { withApi } from '../../../../../lib/api-handler';

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // Раніше сума «abc» проходила перевірку: касовий ордер створювався, а
  // проводка падала — у касовій книзі лишався документ без грошей.
  const body = await parseBody(req, z.object({
    direction:     z.enum(['in', 'out']),
    amount:        zMoney,
    description:   z.string().trim().min(1, 'опис обовʼязковий').max(500),
    category:      zText(100),
    business_date: zYmd,
  }));
  if (!body.ok) return body.response;
  const { direction, amount, description, category, business_date } = body.data;

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

export const POST = withApi('admin/finance/cash', _POST);
