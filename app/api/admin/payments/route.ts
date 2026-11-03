import { NextRequest, NextResponse } from 'next/server';
import { recordCustomerPayment, recordAdvanceReceived } from '../../../../lib/accounting/money';
import { requireStaff } from '../../../../lib/auth-guard';
import { withApi } from '../../../../lib/api-handler';
import { parseBody, z, zMoney, zYmd, zText } from '../../../../lib/validate';

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // Сума, спосіб, дата — за схемою ДО будь-якого запису (аудит 31.10, п. 13)
  const parsed = await parseBody(req, z.object({
    contractId:    z.string().min(1).optional(),
    customerId:    z.string().min(1).optional(),
    amount:        zMoney,
    paymentMethod: z.enum(['bank', 'cash', 'acquiring']),
    businessDate:  zYmd,
    description:   zText(500),
    isAdvance:     z.boolean().optional(),
    /** Виплата від спец-дебітора без договору: НП (COD) або маркетплейс */
    specialCounterparty: z.enum(['np:cod', 'mp:prom', 'mp:rozetka']).optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const { contractId, customerId, amount, paymentMethod, businessDate, description, isAdvance, specialCounterparty } = parsed.data;

  const SPECIAL = { 'np:cod': 'Виплата НП (наложені платежі)', 'mp:prom': 'Виплата Prom.ua', 'mp:rozetka': 'Виплата Rozetka' } as const;

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

export const POST = withApi('admin/payments', _POST);
