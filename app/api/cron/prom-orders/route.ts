import { NextRequest, NextResponse } from 'next/server';
import { syncPromOrders } from '../../../../lib/prom-sync';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPromOrders();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prom-orders cron]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
