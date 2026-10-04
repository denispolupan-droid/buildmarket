import { NextRequest, NextResponse } from 'next/server';
import { syncPromOrders } from '../../../../lib/prom-sync';
import { watchPromCancellations } from '../../../../lib/marketplace-cancel-watch';
import { alertMarketplaceChatDrafts } from '../../../../lib/marketplace-chat-telegram';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!cronAuthorized(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPromOrders();

    // Детект скасувань покупцем після створення замовлення
    let cancelWatch: unknown = null;
    try {
      cancelWatch = await watchPromCancellations();
    } catch (err) {
      console.error('[prom-cancel-watch]', err);
    }

    // Нові повідомлення покупців у чаті → Telegram з чернеткою відповіді й
    // кнопкою «Надіслати як є» (lib/marketplace-chat-telegram)
    let chatWatch: unknown = null;
    try {
      chatWatch = await alertMarketplaceChatDrafts('prom');
    } catch (err) {
      console.error('[prom-chat-alert]', err);
    }

    return NextResponse.json({ ...result, cancelWatch, chatWatch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: синк замовлень Prom впав', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// pg_cron дзвонить через net.http_post (POST). Без цього POST давав би 405 і синк
// не виконувався (як і в sync-suppliers). Vercel cron шле GET — обидва методи ок.
export const POST = GET;
