import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { getMarketplaceBalance, recordMarketplaceCorrection } from '../../../../../../lib/accounting/money';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { marketplace?: string; actualBalance?: number; reason?: string };
  const { marketplace, actualBalance, reason } = body;

  if (marketplace !== 'prom' && marketplace !== 'rozetka') {
    return NextResponse.json({ error: 'Невірний маркетплейс' }, { status: 400 });
  }
  if (actualBalance === undefined || Number.isNaN(actualBalance)) {
    return NextResponse.json({ error: 'Вкажіть реальний баланс з кабінету' }, { status: 400 });
  }

  try {
    const ourBalance = await getMarketplaceBalance(marketplace);
    const diff = Math.round((actualBalance - ourBalance) * 100) / 100;

    if (diff === 0) {
      return NextResponse.json({ ok: true, diff: 0, matched: true });
    }

    await recordMarketplaceCorrection({
      marketplace, amount: diff,
      reason: reason?.trim() || 'Звірка з кабінетом маркетплейсу',
      createdBy: user.email ?? 'admin',
    });

    return NextResponse.json({ ok: true, diff, matched: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-balance/reconcile]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
