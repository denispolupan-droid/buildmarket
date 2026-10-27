import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { listReturns } from '../../../../../lib/accounting/returns';

// Журнал повернень: ПВ (від покупця) і ПП (постачальнику) одним списком
// із показниками «очікуємо товар» / «в дорозі до постачальника».

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const p = req.nextUrl.searchParams;
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  try {
    const res = await listReturns({
      limit: Number(p.get('limit') ?? 200) || 200,
      from: date(p.get('from')),
      to: date(p.get('to')),
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
