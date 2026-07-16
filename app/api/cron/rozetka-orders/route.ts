import { NextRequest, NextResponse } from 'next/server';
import { syncRozetkaOrders } from '../../../../lib/rozetka-sync';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncRozetkaOrders();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-orders cron]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
