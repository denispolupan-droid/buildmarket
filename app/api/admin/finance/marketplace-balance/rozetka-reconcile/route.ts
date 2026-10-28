import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { reconcileRozetka } from '../../../../../../lib/recon/rozetka';

export type { ReconcileRow } from '../../../../../../lib/recon/rozetka';

// Побудкова звірка з кабінетом Rozetka для екрана «Маркетплейси». Логіка — у
// lib/recon/rozetka (нею ж користується тижневий агент звірки). Нічого не пише в БД;
// проведення різниці — вручну через «Операцію» (route /adjust).
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defFrom = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') ?? '') ? sp.get('from')! : defFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') ?? '') ? sp.get('to')! : today;

  try {
    return NextResponse.json(await reconcileRozetka(from, to));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-reconcile]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
