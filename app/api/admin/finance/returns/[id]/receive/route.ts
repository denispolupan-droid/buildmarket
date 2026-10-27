import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../../lib/auth-guard';
import { receiveCustomerReturn } from '../../../../../../../lib/accounting/returns';
import type { RefundMethod } from '../../../../../../../lib/accounting/returns-rules';

// ПВ: «Товар отримано» — проведення повернення від покупця датою отримання.
// Сума — лише з рядків документа в БД; клієнт каже тільки дату й спосіб
// повернення коштів.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { received_at?: string; refund?: { method: RefundMethod } | null };
  const refund = body.refund === undefined ? undefined
    : body.refund && (body.refund.method === 'bank' || body.refund.method === 'cash') ? { method: body.refund.method } : null;
  try {
    const res = await receiveCustomerReturn({ docId: id, receivedAt: body.received_at ?? null, refund, confirmedBy: auth.user.email ?? 'admin' });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /не знайдено|Це не повернення|уже проведено|уже скасовано|Період .* закрито/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
