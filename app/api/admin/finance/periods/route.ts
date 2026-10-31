import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

// Закриття облікових періодів («дата заборони редагування»).
// GET — список місяців з оборотами і станом; POST — закрити/відкрити місяць.

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();

  const [{ data: bounds }, { data: periods }] = await Promise.all([
    db.from('money_entries').select('business_date').order('business_date', { ascending: true }).limit(1),
    db.from('acc_periods').select('period, closed_at, closed_by'),
  ]);

  const first = bounds?.[0]?.business_date ? new Date(bounds[0].business_date) : new Date();
  const now = new Date();
  const months: { month: string; closed: boolean; closed_at: string | null; closed_by: string | null }[] = [];
  const closedMap = new Map((periods ?? []).map(p => [p.period as string, p]));

  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  while (cursor <= now) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`;
    const p = closedMap.get(key);
    months.push({
      month: key,
      closed: !!p?.closed_at,
      closed_at: p?.closed_at ?? null,
      closed_by: p?.closed_by ?? null,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Обороти по місяцях — агрегат у базі (acc_period_turnover, міграція 140).
  // Раніше читався весь леджер без меж: PostgREST віддає лише перші 1000
  // рядків, і обороти рахувались по них (аудит 31.10.2026).
  const { data: turnoverRows, error: turnoverErr } = await db.rpc('acc_period_turnover');
  if (turnoverErr) return NextResponse.json({ error: turnoverErr.message }, { status: 500 });
  const turnover = new Map<string, { txns: number; revenue: number }>();
  for (const r of (turnoverRows ?? []) as { month: string; txns: number; revenue: number }[]) {
    turnover.set(String(r.month).slice(0, 10), { txns: Number(r.txns), revenue: Number(r.revenue) });
  }

  return NextResponse.json({
    months: months.reverse().map(m => ({
      ...m,
      entries: turnover.get(m.month)?.txns ?? 0,
      revenue: Math.round((turnover.get(m.month)?.revenue ?? 0) * 100) / 100,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as { month?: string; action?: 'close' | 'open' };
  if (!body.month || !/^\d{4}-\d{2}-01$/.test(body.month) || !['close', 'open'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  const fn = body.action === 'close' ? 'close_period' : 'open_period';
  const { data, error } = await db.rpc(fn, { p_month: body.month, p_by: auth.user.email ?? 'admin' });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ ok: true, result: data });
}
