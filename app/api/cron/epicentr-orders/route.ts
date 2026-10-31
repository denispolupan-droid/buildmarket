import { NextRequest, NextResponse } from 'next/server';
import { syncEpicentrOrders } from '../../../../lib/epicentr-sync';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { withCronLock } from '../../../../lib/cron-lock';

// Синк замовлень Епіцентру (Vercel Cron, vercel.json). Скасування покупцем і
// допуш статусів/ТТН — усередині syncEpicentrOrders (окремого watch-модуля не
// треба: список /v4/oms/orders повертає і скасовані, і живі статуси разом).
async function run(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!cronAuthorized(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncEpicentrOrders();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: синк замовлень Епіцентру впав', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// Тік не стартує поверх ще живого попереднього (lib/cron-lock, міграція 141,
// аудит 31.10.2026). Зайнятий лок — це не збій: відповідаємо 200 без алерту.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('epicentr-orders', 240, () => run(req));
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const POST = GET;
