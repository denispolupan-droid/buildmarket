import { NextRequest, NextResponse } from 'next/server';
import { recordMarketplaceTopup } from '../../../../../../lib/accounting/money';
import { requireStaff } from '../../../../../../lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await req.json() as {
    marketplace?: string; amount?: number; paymentMethod?: 'bank' | 'cash' | 'novapay'; businessDate?: string;
  };
  const { marketplace, amount, paymentMethod, businessDate } = body;

  if (marketplace !== 'prom' && marketplace !== 'rozetka' && marketplace !== 'epicentr') {
    return NextResponse.json({ error: 'Невірний маркетплейс' }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Вкажіть суму поповнення' }, { status: 400 });
  }
  if (paymentMethod !== 'bank' && paymentMethod !== 'cash' && paymentMethod !== 'novapay') {
    return NextResponse.json({ error: 'Вкажіть спосіб оплати' }, { status: 400 });
  }

  try {
    await recordMarketplaceTopup({
      marketplace, amount, paymentMethod, businessDate,
      createdBy: user.email ?? 'admin',
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-balance/topup]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
