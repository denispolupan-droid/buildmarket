import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { createDebtAdjustment, listDebtAdjustments } from '../../../../../lib/accounting/debt-adjustment';
import type { AdjustmentLineInput } from '../../../../../lib/accounting/debt-adjustment-rules';
import { withApi } from '../../../../../lib/api-handler';
import { parseBody, z, zMoney, zText, zYmdOpt } from '../../../../../lib/validate';

// «Коригування боргу» (КБ): список і проведення. Документ проводиться одразу —
// як платіжні ваучери; чернеток немає, помилка валідації = нічого не записано.

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100));
  try {
    return NextResponse.json({ documents: await listDebtAdjustments(createServiceClient(), { limit }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = withApi('admin/finance/debt-adjustments', _GET);

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  // Форма рядків — за схемою (аудит 31.10, п. 13); межі сум перевіряє сервер за
  // леджером: клієнтські цифри лише кажуть, ЩО перенести.
  const zSide = z.object({ account: z.string().min(1), party: z.string().min(1), orderId: z.string().nullable().optional() });
  const zLine = z.discriminatedUnion('op', [
    z.object({ op: z.literal('transfer'),  from: zSide, to: zSide, amount: zMoney, note: zText(500).nullable() }),
    z.object({ op: z.literal('offset'),    customer: zSide, supplier: zSide, amount: zMoney, note: zText(500).nullable() }),
    z.object({ op: z.literal('write_off'), side: zSide, kind: z.enum(['forgive', 'income']), amount: zMoney, note: zText(500).nullable() }),
  ]);
  const parsed = await parseBody(req, z.object({
    business_date: zYmdOpt,
    notes:         zText(1000),
    lines:         z.array(zLine).min(1, 'Додайте хоча б один рядок').max(200),
  }));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const lines = body.lines as AdjustmentLineInput[];

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

export const POST = withApi('admin/finance/debt-adjustments', _POST);
