import { NextRequest, NextResponse } from 'next/server';
import { syncRozetkaOrders } from '../../../../lib/rozetka-sync';
import { watchRozetkaCancellations } from '../../../../lib/marketplace-cancel-watch';
import { watchRozetkaRefunds } from '../../../../lib/marketplace-returns-watch';
import { alertRozetkaChatUnread, alertRozetkaReviews } from '../../../../lib/marketplace-chat-alerts';
import { syncRozetkaFees } from '../../../../lib/rozetka-fees-sync';
import { alertAdmin } from '../../../../lib/alert';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncRozetkaOrders();

    // Детект скасувань покупцем після створення замовлення (авто-скасування
    // невідвантажених; алерт для відвантажених — оформити повернення вручну)
    let cancelWatch: unknown = null;
    try {
      cancelWatch = await watchRozetkaCancellations();
    } catch (err) {
      console.error('[rozetka-cancel-watch]', err);
    }

    // Заявки на повернення з кабінету (алерт + банер в адмінці)
    let refundWatch: unknown = null;
    try {
      refundWatch = await watchRozetkaRefunds();
    } catch (err) {
      console.error('[rozetka-refund-watch]', err);
    }

    // Нові повідомлення покупців у чаті → Telegram
    let chatWatch: unknown = null;
    try {
      chatWatch = await alertRozetkaChatUnread();
    } catch (err) {
      console.error('[rozetka-chat-alert]', err);
    }

    // Нові відгуки покупців → Telegram
    let reviewWatch: unknown = null;
    try {
      reviewWatch = await alertRozetkaReviews();
    } catch (err) {
      console.error('[rozetka-review-alert]', err);
    }

    // Фактичні збори з балансів Rozetka (організація видачі, абонплата) і
    // доведення нарахованої комісії до тієї, що площадка реально списала.
    // Проводимо саме факт, а не передбачення — див. lib/rozetka-fees-sync.
    let fees: unknown = null;
    try {
      fees = await syncRozetkaFees();
    } catch (err) {
      console.error('[rozetka-fees-sync]', err);
    }

    return NextResponse.json({ ...result, cancelWatch, refundWatch, chatWatch, reviewWatch, fees });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: синк замовлень Rozetka впав', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// pg_cron дзвонить через net.http_post (POST). Без цього POST давав би 405 і синк
// не виконувався (як і в sync-suppliers). Vercel cron шле GET — обидва методи ок.
export const POST = GET;
