import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMonoAcquiringToken } from '../../../../../lib/mono-config';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Оплата рахунку карткою онлайн (Monobank acquiring). Публічний роут — доступ
// за unguessable UUID замовлення, як і сама сторінка рахунку. Створює mono-інвойс
// на НЕДОПЛАЧЕНИЙ залишок; зарахування робить вебхук /api/webhooks/monobank
// (reference-схема `invoice_<orderId>_<ts>`).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, status, total_price, amount_paid')
    .eq('id', id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'Замовлення скасовано — оплата неможлива' }, { status: 409 });
  }

  const due = Math.round((Number(order.total_price) - Number(order.amount_paid ?? 0)) * 100) / 100;
  if (due <= 0) return NextResponse.json({ error: 'Рахунок вже оплачено' }, { status: 409 });

  const token = getMonoAcquiringToken();
  if (!token) return NextResponse.json({ error: 'Онлайн-оплата тимчасово недоступна' }, { status: 503 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const reference = `invoice_${order.id}_${Date.now()}`;

  try {
    const monoRes = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: { 'X-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(due * 100),
        ccy:    980,
        merchantPaymInfo: {
          reference,
          destination: `Оплата замовлення №${order.order_number} — FIXLINE`,
          comment:     `Оплата замовлення №${order.order_number} — FIXLINE`,
        },
        redirectUrl: `${siteUrl}/invoice/${order.id}?paid=1`,
        webHookUrl:  `${siteUrl}/api/webhooks/monobank`,
      }),
    });
    const monoData = await monoRes.json();
    if (monoRes.ok && monoData.pageUrl) {
      return NextResponse.json({ ok: true, pageUrl: monoData.pageUrl, amount: due });
    }
    console.error('[invoice pay] mono error:', monoData);
    return NextResponse.json({ error: 'Не вдалось ініціювати оплату. Спробуйте пізніше.' }, { status: 502 });
  } catch (err) {
    console.error('[invoice pay]', err);
    return NextResponse.json({ error: 'Не вдалось ініціювати оплату. Спробуйте пізніше.' }, { status: 502 });
  }
}
