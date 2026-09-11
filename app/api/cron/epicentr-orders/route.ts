import { NextRequest, NextResponse } from 'next/server';
import { syncEpicentrOrders } from '../../../../lib/epicentr-sync';
import { alertAdmin } from '../../../../lib/alert';

// Синк замовлень Епіцентру (Vercel Cron, vercel.json). Скасування покупцем і
// допуш статусів/ТТН — усередині syncEpicentrOrders (окремого watch-модуля не
// треба: список /v4/oms/orders повертає і скасовані, і живі статуси разом).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

export const POST = GET;
