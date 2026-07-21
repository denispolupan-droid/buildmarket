import { NextRequest, NextResponse } from 'next/server';
import { syncPromOrders } from '../../../../lib/prom-sync';
import { watchPromCancellations } from '../../../../lib/marketplace-cancel-watch';
import { alertAdmin } from '../../../../lib/alert';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    return NextResponse.json({ ...result, cancelWatch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: синк замовлень Prom впав', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// pg_cron дзвонить через net.http_post (POST). Без цього POST давав би 405 і синк
// не виконувався (як і в sync-suppliers). Vercel cron шле GET — обидва методи ок.
export const POST = GET;
