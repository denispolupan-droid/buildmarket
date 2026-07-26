import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordMarketplaceManualEntry } from '../../../../../../lib/accounting/money';

// Ручна операція по балансу маркетплейсу: списання збору (доставка/реклама/інше)
// АБО нарахування (компенсація від площадки). Проводить пару
// marketplace_fee / marketplace_balance — те саме, що робить комісія, але вручну.
const CATEGORY_LABEL: Record<string, string> = {
  delivery:     'Доставка',
  ad:           'Реклама',
  compensation: 'Компенсація',
  other:        'Інше',
};

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    marketplace?: string;
    direction?: 'charge' | 'credit';
    amount?: number;
    category?: string;
    orderNumber?: number | string | null;
    note?: string;
    businessDate?: string;
  };

  const { marketplace, direction, category, note, businessDate } = body;
  if (marketplace !== 'prom' && marketplace !== 'rozetka') {
    return NextResponse.json({ error: 'Невірний маркетплейс' }, { status: 400 });
  }
  if (direction !== 'charge' && direction !== 'credit') {
    return NextResponse.json({ error: 'Вкажіть напрям (списання/нарахування)' }, { status: 400 });
  }
  const amountAbs = Math.abs(Number(body.amount));
  if (!amountAbs || Number.isNaN(amountAbs)) {
    return NextResponse.json({ error: 'Вкажіть суму' }, { status: 400 });
  }
  const cat = category && CATEGORY_LABEL[category] ? category : 'other';

  const db = createServiceClient();

  // № замовлення (необов'язково) → order_id для привʼязки проводки
  let orderId: string | null = null;
  const num = body.orderNumber != null && String(body.orderNumber).trim() !== ''
    ? parseInt(String(body.orderNumber), 10) : null;
  if (num && !Number.isNaN(num)) {
    const { data: ord } = await db
      .from('orders')
      .select('id')
      .eq('order_number', num)
      .eq('channel_code', marketplace)
      .maybeSingle();
    if (!ord) {
      return NextResponse.json({ error: `Замовлення №${num} на ${marketplace} не знайдено` }, { status: 404 });
    }
    orderId = ord.id;
  }

  try {
    const signed = direction === 'charge' ? -amountAbs : amountAbs;
    const txnId = await recordMarketplaceManualEntry({
      marketplace,
      amount:       signed,
      category:     cat,
      label:        CATEGORY_LABEL[cat],
      orderId,
      note:         note?.trim() || undefined,
      businessDate: businessDate || undefined,
      createdBy:    auth.user.email ?? 'admin',
    });
    return NextResponse.json({ ok: true, txnId, amount: signed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-balance/adjust]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
