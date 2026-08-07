import { NextRequest, NextResponse } from 'next/server';
import { syncDeliveryStatuses } from '../../../../lib/delivery-sync';

// Щогодинний синк руху посилок. Сама логіка — у lib/delivery-sync (її ж викликає
// кнопка «Синхронізувати НП» в адмінці), тут лишається тільки авторизація крона
// й причеплений до цього ж запуску нагадувач про покинуті кошики.

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncDeliveryStatuses('cron:sync-delivery-status');

  // Also run abandoned cart reminders (piggybacked on this daily cron)
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
    await fetch(`${siteUrl}/api/cron/abandoned-cart`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  } catch {}

  return NextResponse.json(result);
}
