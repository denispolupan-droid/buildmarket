import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';
import { sweepOutbox } from '../../../../lib/outbox/sweeper';

// Диспетчер outbox (docs/OUTBOX-PLAN.md): раз на хвилину бере pending-події й
// виконує обробники. Падіння самого тіку — у withApi (алерт); падіння окремої
// події — усередині sweeper (повтор за backoff, failed + алерт після 5-ї).
export const maxDuration = 60;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const r = await withCronLock('outbox-sweep', 55, () => sweepOutbox());
  if (r.skipped) return NextResponse.json({ skipped: true });
  return NextResponse.json(r.result);
}

export const GET = withApi('cron/outbox-sweep', _GET);
export const POST = GET;
