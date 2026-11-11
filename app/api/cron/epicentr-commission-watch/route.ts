import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase-service';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { compareCommissions, loadEpicentrTariffRates } from '../../../../lib/epicentr-commission-watch';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Щотижнева звірка комісій Епіцентру з публічним тарифом (vercel.json, пн 07:15 UTC).
// Ставки в категоріях не змінюємо — лише Telegram власнику: комісія входить у ціну
// (lib/marketplace-pricing.epicentrPrice), її зміна — рішення про ціни.
async function run() {
  const db = createServiceClient();
  const cats = await fetchAllRows<{ slug: string; name: string; epicentr_category_code: string | null; epicentr_commission_pct: number | null }>(
    (f, t) => db.from('categories').select('slug, name, epicentr_category_code, epicentr_commission_pct').order('slug').range(f, t),
  );
  const codes = cats.map(c => c.epicentr_category_code).filter((c): c is string => !!c);
  if (!codes.length) return NextResponse.json({ ok: true, skipped: 'немає кодів категорій' });

  let rates;
  try {
    rates = await loadEpicentrTariffRates(codes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Епіцентр: не вдалося прочитати тариф комісій', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const unknown = [...new Set(codes)].filter(c => rates.get(c)?.rate == null);
  const diffs = compareCommissions(cats, rates);
  const names = new Map(cats.map(c => [c.slug, c.name]));

  if (diffs.length) {
    const lines = diffs.slice(0, 25).map(d =>
      `• ${names.get(d.slug) ?? d.slug}: у нас ${d.ours ?? '—'} %, Епіцентр ${d.theirs} %`);
    alertAdmin(
      `Епіцентр змінив комісії: ${diffs.length} категорій`,
      `${lines.join('\n')}${diffs.length > 25 ? `\n…ще ${diffs.length - 25}` : ''}\n\nЦіни Епіцентру рахуються від нашої ставки. Оновити — «Епіцентр → Товари» (комісія категорії); ціни підуть на площадку щогодинним пушем.`,
    );
  }
  if (unknown.length > codes.length / 2) {
    alertAdmin('Епіцентр: тариф комісій не розпізнано', `Не знайдено ставок для ${unknown.length} з ${new Set(codes).size} кодів — змінилась структура тарифу або таблиці «Дерево категорій».`);
  }

  log.info('epicentr.commission_watch', { categories: cats.length, codes: new Set(codes).size, diffs: diffs.length, unknown: unknown.length });
  return NextResponse.json({ ok: true, diffs, unknown });
}

export const maxDuration = 120;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('epicentr-commission-watch', 240, () => run());
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const GET = withApi('cron/epicentr-commission-watch', _GET);

export const POST = GET;
