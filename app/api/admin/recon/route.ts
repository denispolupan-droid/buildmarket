import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { runMarketplaceRecon } from '../../../../lib/recon/run';

export const maxDuration = 300;

// Звірка з маркетплейсами вручну: перегляд (send=false) або з відправкою в Telegram.
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { send?: boolean };
  try {
    const run = await runMarketplaceRecon({ send: Boolean(body.send), createdBy: auth.user.email ?? null });
    return NextResponse.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/recon]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
