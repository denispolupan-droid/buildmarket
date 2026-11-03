import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { cancelReturn, getReturnCard, updateReturnDetails } from '../../../../../../lib/accounting/returns';
import { isReturnReason } from '../../../../../../lib/accounting/returns-rules';
import { withApi } from '../../../../../../lib/api-handler';

const USER_ERR = /не знайдено|не є поверненням|уже скасовано|Спочатку скасуйте|Неможливо|недостатньо|Період .* закрито/;

async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const card = await getReturnCard(id);
  if (!card) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
  return NextResponse.json(card);
}

export const GET = withApi('admin/finance/returns/[id]', _GET);

/** Реквізити, що не впливають на проводки: ТТН, причина, коментар. */
async function _PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { ttn?: string | null; reason?: string; reason_text?: string | null };
  try {
    await updateReturnDetails(id, {
      ttn: body.ttn,
      reason: isReturnReason(body.reason) ? body.reason : undefined,
      reason_text: body.reason_text,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: USER_ERR.test(message) ? 400 : 500 });
  }
}

export const PATCH = withApi('admin/finance/returns/[id]', _PATCH);

async function _DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  try {
    await cancelReturn(id, body.reason?.trim() || null, auth.user.email ?? 'admin');
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: USER_ERR.test(message) ? 400 : 500 });
  }
}

export const DELETE = withApi('admin/finance/returns/[id]', _DELETE);
