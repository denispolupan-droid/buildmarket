import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createCustomerReturn, getReturnableItems } from '../../../../../../lib/accounting/returns';
import { isReturnReason, type RefundMethod } from '../../../../../../lib/accounting/returns-rules';

// Повернення від покупця по замовленню: GET — що можна повернути, POST — заявка
// (чернетка ПВ «очікуємо товар»). Проводки робляться в журналі повернень
// кнопкою «Товар отримано» (lib/accounting/returns → receiveCustomerReturn).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const res = await getReturnableItems(id);
    if (!res.hasSale) return NextResponse.json({ error: 'Немає підтвердженої РН — повертати нічого' }, { status: 409 });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    items?: { sku: string; qty: number }[];
    reason?: string;
    reason_text?: string;
    ttn?: string;
    mp_unaware?: boolean;
    refund?: { method: RefundMethod } | null;
  };
  const items = (body.items ?? []).map(i => ({ sku: String(i.sku), qty: Number(i.qty) })).filter(i => i.qty > 0);
  if (!items.length) return NextResponse.json({ error: 'Не обрано позицій' }, { status: 400 });
  if (!isReturnReason(body.reason)) return NextResponse.json({ error: 'Вкажіть причину повернення' }, { status: 400 });
  const refund = body.refund && (body.refund.method === 'bank' || body.refund.method === 'cash') ? { method: body.refund.method } : null;

  try {
    const res = await createCustomerReturn({
      orderId: id, items, reason: body.reason, reasonText: body.reason_text ?? null,
      ttn: body.ttn ?? null, mpUnaware: !!body.mp_unaware, refund,
      createdBy: auth.user.email ?? 'admin',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /не знайдено|Немає підтвердженої|доступно|Не обрано|більше нуля|дублюється/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
