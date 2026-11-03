import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { runOpsDigest } from '../../../../lib/ops-digest';
import { withApi } from '../../../../lib/api-handler';

export const maxDuration = 120;

// Ранковий дайджест вручну: попередній перегляд (send=false) або відправка в Telegram.
async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { send?: boolean };
  try {
    const run = await runOpsDigest({ send: Boolean(body.send), createdBy: auth.user.email ?? null });
    return NextResponse.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/digest]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi('admin/digest', _POST);
