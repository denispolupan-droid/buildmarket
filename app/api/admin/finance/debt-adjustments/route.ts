import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { createDebtAdjustment, listDebtAdjustments } from '../../../../../lib/accounting/debt-adjustment';
import type { AdjustmentLineInput } from '../../../../../lib/accounting/debt-adjustment-rules';

// «Коригування боргу» (КБ): список і проведення. Документ проводиться одразу —
// як платіжні ваучери; чернеток немає, помилка валідації = нічого не записано.

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100));
  try {
    return NextResponse.json({ documents: await listDebtAdjustments(createServiceClient(), { limit }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    business_date?: string; notes?: string; lines?: AdjustmentLineInput[];
  };
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'Додайте хоча б один рядок' }, { status: 400 });
  }
  // Суми — числа з клієнта, але межі перевіряє сервер за леджером; клієнтським
  // цифрам тут не довіряють, вони лише кажуть, ЩО перенести.
  const lines = body.lines.map(l => ({ ...l, amount: Number(l.amount) })) as AdjustmentLineInput[];

  try {
    const res = await createDebtAdjustment({
      lines, businessDate: body.business_date, notes: body.notes ?? null,
      createdBy: auth.user.email ?? 'admin', meta: { source: 'admin' },
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Закритий період / межі — помилка користувача, не сервера
    const status = /Період .* закрито|Рядок \d+:|не знайдено|дропшип|без рядків|Забагато/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
