import { NextRequest, NextResponse } from 'next/server';
import { runMarketplaceRecon } from '../../../../lib/recon/run';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Тижнева звірка з маркетплейсами й рахунками (lib/recon/run) у Telegram.
 * Розклад — vercel.json (пн 05:20 UTC). Лише читання: нічого не проводить.
 * Вимкнути: app_settings.mp_recon = 'off'.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { createServiceClient } = await import('../../../../lib/supabase');
    const { data } = await createServiceClient().from('app_settings').select('value').eq('key', 'mp_recon').maybeSingle();
    if ((data?.value ?? '').trim().toLowerCase() === 'off') return NextResponse.json({ ok: true, skipped: 'mp_recon=off' });
    const run = await runMarketplaceRecon({ send: true, createdBy: 'cron' });
    return NextResponse.json({ ok: run.errors.length === 0, sent: run.sent, findings: run.findings.length, errors: run.errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    alertAdmin('Звірка з маркетплейсами не зібралась', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
