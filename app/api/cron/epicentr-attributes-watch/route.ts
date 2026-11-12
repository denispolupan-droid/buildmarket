import { NextRequest, NextResponse } from 'next/server';
import { compareAttributeSets, driftText, loadLiveAttributeSets, snapshotSets } from '../../../../lib/epicentr-attributes-watch';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

// Щотижнева звірка довідника атрибутів Епіцентру зі знімком у репозиторії
// (vercel.json, пн 07:25 UTC). Сам знімок оновлює людина/сесія скриптом —
// файл живе в коді, крон його не перепише; тут лише Telegram, що пора.
async function run() {
  const snap = snapshotSets();
  let live;
  try {
    live = await loadLiveAttributeSets(snap.map(s => s.code));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Епіцентр: не вдалося прочитати довідник атрибутів', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
  const drift = compareAttributeSets(snap, live);
  // «Більше не обовʼязкове» не ламає фід — повідомляємо лише разом із суттєвим
  const serious = drift.filter(d => d.kind !== 'no_longer_required');
  if (serious.length) {
    alertAdmin(
      `Епіцентр змінив обовʼязкові атрибути: ${serious.length}`,
      `${driftText(drift)}\n\nФід і агент заведення товару ще працюють за старим довідником — картки можуть зависнути в «Чернетках». Оновити: npx tsx --env-file=.env.local scripts/epicentr-attributes-sync.mts, потім scripts/epicentr-attributes-report.mts і правила в lib/epicentr-attribute-rules.`,
    );
  }
  log.info('epicentr.attributes_watch', { sets: snap.length, live: live.length, drift: drift.length, serious: serious.length });
  return NextResponse.json({ ok: true, drift });
}

export const maxDuration = 120;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('epicentr-attributes-watch', 240, () => run());
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const GET = withApi('cron/epicentr-attributes-watch', _GET);
