import { NextRequest, NextResponse } from 'next/server';
import { isDigestEnabled, runOpsDigest } from '../../../../lib/ops-digest';
import { alertAdmin } from '../../../../lib/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Ранковий дайджест по операціях у Telegram (розклад — vercel.json, 04:30 UTC =
 * 07:30 Київ улітку / 06:30 узимку). Цифри рахує код, модель пише текст.
 * Вимкнути: app_settings.ops_digest = 'off'.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isDigestEnabled())) return NextResponse.json({ ok: true, skipped: 'ops_digest=off' });
  try {
    const run = await runOpsDigest({ send: true, createdBy: 'cron' });
    return NextResponse.json({ ok: true, sent: run.sent, costUsd: run.costUsd, modelError: run.error ?? null, signals: run.data.signals.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[morning-digest]', err);
    alertAdmin('Ранковий дайджест не зібрався', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
