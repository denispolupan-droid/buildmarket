import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../../lib/auth-guard';
import { createSupplierReturn } from '../../../../../../../lib/accounting/returns';
import { isReturnReason } from '../../../../../../../lib/accounting/returns-rules';

// ПП на підставі ПВ: повернений покупцем товар їде постачальнику.
// Межа — рядки ПВ мінус уже відправлене; склад має фізично мати товар.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    supplier_id?: number; lines?: { sku: string; qty: number }[]; reason?: string; reason_text?: string; ttn?: string;
  };
  const lines = (body.lines ?? []).map(l => ({ sku: String(l.sku), qty: Number(l.qty) })).filter(l => l.qty > 0);
  if (!lines.length) return NextResponse.json({ error: 'Не обрано позицій' }, { status: 400 });
  if (!body.supplier_id) return NextResponse.json({ error: 'Вкажіть постачальника' }, { status: 400 });
  try {
    const res = await createSupplierReturn({
      basis: { kind: 'customer_return', docId: id },
      supplierId: Number(body.supplier_id), lines,
      reason: isReturnReason(body.reason) ? body.reason : 'surplus',
      reasonText: body.reason_text ?? null, ttn: body.ttn ?? null,
      createdBy: auth.user.email ?? 'admin',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /доступно|не знайдено|Підстава|Спочатку|Не обрано|Не вказано|більше нуля|на складі/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
