import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { cancelDebtAdjustment, listDebtAdjustments } from '../../../../../../lib/accounting/debt-adjustment';
import { withApi } from '../../../../../../lib/api-handler';

async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const [doc] = await listDebtAdjustments(createServiceClient(), { id, limit: 1 });
  if (!doc) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export const GET = withApi('admin/finance/debt-adjustments/[id]', _GET);

// Скасування: зворотні проводки по кожному рядку + зворотні рядки оплат на
// замовленнях; сам документ → 'cancelled'. Повторний виклик безпечний.
async function _DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  try {
    await cancelDebtAdjustment(id, auth.user.email ?? 'admin', body.reason ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: /не знайдено|уже скасовано/.test(message) ? 400 : 500 });
  }
}

export const DELETE = withApi('admin/finance/debt-adjustments/[id]', _DELETE);
