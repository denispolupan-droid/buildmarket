import { NextRequest, NextResponse } from 'next/server';
import { isWatchEnabled, runMetricWatch } from '../../../../lib/metric-watch';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Сторож показників (lib/metric-watch): ?scope=daily — раз на день після знімка
 * Search Console (gsc-snapshot 06:40 UTC), ?scope=hourly — доступність сайту.
 * Пише в Telegram лише про зміни. Вимкнути: app_settings.metric_watch = 'off'.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const scope = req.nextUrl.searchParams.get('scope') === 'hourly' ? 'hourly' : 'daily';
  if (!(await isWatchEnabled())) return NextResponse.json({ ok: true, skipped: 'metric_watch=off' });
  try {
    const r = await runMetricWatch(scope);
    return NextResponse.json({
      ok: true, scope, sent: r.sent, changed: r.message != null,
      readings: r.readings.map(x => ({ key: x.key, state: x.reading?.state ?? null, error: x.error ?? null })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[metric-watch]', err);
    alertAdmin('Сторож показників не відпрацював', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
