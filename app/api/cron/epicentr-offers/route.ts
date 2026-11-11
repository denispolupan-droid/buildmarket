import { NextRequest, NextResponse } from 'next/server';
import { pushEpicentrOffers } from '../../../../lib/epicentr-offers-push';
import { hasEpicentrToken } from '../../../../lib/epicentr-api';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Наявність і ціни в Епіцентр через /v1/offers щогодини (Vercel Cron, vercel.json,
// хвилина 20 — після синку постачальників о :00 кожні 2 год).
//
// Навіщо: кабінет сам перечитує фід лише раз на добу (00:00–02:00), і то якщо в
// «Імпорт → Автооновлення залишків» вставлено посилання. 11.11.2026 перше замовлення
// Епіцентру (58851611) прийшло на клей 1606-003, якого в постачальника не було з
// 10.11 — на площадці він досі був «в наявності». Ідентичні запити Епіцентр
// ігнорує 30 хв (cache_noop), тож пуш усього каталогу щогодини — 4 запити.
async function run() {
  if (!(await hasEpicentrToken())) return NextResponse.json({ ok: false, skipped: 'Ключ API Епіцентру не налаштований' });
  try {
    const result = await pushEpicentrOffers();
    if (!result.ok) {
      alertAdmin('Cron: пуш наявності в Епіцентр не вдався', result.skipped ?? 'невідома помилка');
    } else if (result.errors > 0) {
      log.warn('epicentr.offers_push_errors', { errors: result.errors, sample: result.error_sample });
    }
    log.info('epicentr.offers_pushed', {
      total: result.total, enqueued: result.enqueued, unknown: result.unknown, noop: result.noop, errors: result.errors,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: пуш наявності в Епіцентр впав', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 120;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('epicentr-offers', 240, () => run());
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const GET = withApi('cron/epicentr-offers', _GET);

export const POST = GET;
