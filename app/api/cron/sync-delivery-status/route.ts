import { NextRequest, NextResponse } from 'next/server';
import { syncDeliveryStatuses } from '../../../../lib/delivery-sync';
import { checkRzBalanceAlert } from '../../../../lib/rz-delivery-api';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';

// Щогодинний синк руху посилок. Сама логіка — у lib/delivery-sync (її ж викликає
// кнопка «Синхронізувати НП» в адмінці), тут лишається тільки авторизація крона
// й причеплений до цього ж запуску нагадувач про покинуті кошики.

async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Цей крон проводить продажі при врученні — його мовчазне падіння означає
  // невиручені РН і неправильну виручку (аудит 31.10.2026), тому — алерт.
  let result: Awaited<ReturnType<typeof syncDeliveryStatuses>>;
  try {
    result = await syncDeliveryStatuses('cron:sync-delivery-status');
  } catch (err) {
    alertAdmin('Cron: синк доставки впав', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // Логістичний баланс ROZETKA Доставки: борг блокує створення накладних мовчки,
  // тому перевіряємо тим самим кроном. Сам виклик помилок не кидає.
  await checkRzBalanceAlert();

  // Also run abandoned cart reminders (piggybacked on this daily cron)
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
    await fetch(`${siteUrl}/api/cron/abandoned-cart`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  } catch {}

  return NextResponse.json(result);
}

// Тік не стартує поверх ще живого попереднього (lib/cron-lock, міграція 141,
// аудит 31.10.2026). Зайнятий лок — це не збій: відповідаємо 200 без алерту.
export const maxDuration = 120;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('sync-delivery-status', 240, () => run(req));
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const GET = withApi('cron/sync-delivery-status', _GET);
