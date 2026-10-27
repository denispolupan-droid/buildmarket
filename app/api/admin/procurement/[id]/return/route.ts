import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createSupplierReturn } from '../../../../../../lib/accounting/returns';
import { isReturnReason } from '../../../../../../lib/accounting/returns-rules';

// Повернення постачальнику по приходу: документ ПП одразу проводиться
// (склад OUT + борг постачальнику менше), стадія «відправлено». Межа —
// кількість цього приходу мінус попередні повернення по ньому.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { id: receiptId } = await params;
  const body = await req.json().catch(() => ({})) as {
    reason?: string;           // текст причини (старий клієнт) або код
    reason_code?: string;
    ttn?: string;
    lines?: { sku: string; qty: number }[];
  };
  const lines = (body.lines ?? []).map(l => ({ sku: String(l.sku), qty: Number(l.qty) })).filter(l => l.qty > 0);
  if (!lines.length) return NextResponse.json({ error: 'Вкажіть кількість для повернення' }, { status: 400 });
  const reasonText = (body.reason ?? '').trim();
  const reason = isReturnReason(body.reason_code) ? body.reason_code : isReturnReason(body.reason) ? body.reason : 'other';
  if (reason === 'other' && !reasonText) return NextResponse.json({ error: 'Вкажіть причину повернення' }, { status: 400 });

  const db = createServiceClient();
  const { data: receipt } = await db.from('acc_documents').select('id, supplier_id').eq('id', receiptId).maybeSingle();
  if (!receipt) return NextResponse.json({ error: 'Прихід не знайдено' }, { status: 404 });
  if (!receipt.supplier_id) return NextResponse.json({ error: 'У приходу немає постачальника' }, { status: 409 });

  try {
    const res = await createSupplierReturn({
      basis: { kind: 'receipt', docId: receiptId },
      supplierId: receipt.supplier_id, lines, reason,
      reasonText: isReturnReason(body.reason) ? null : reasonText,
      ttn: body.ttn ?? null, createdBy: auth.user.email ?? 'admin',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /доступно|не знайдено|тільки проведені|не збігається|Не обрано|більше нуля/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
