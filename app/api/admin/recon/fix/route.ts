import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { applyReconFix } from '../../../../../lib/recon/fixes';

export const maxDuration = 120;

// Виправлення агента звірки в один клік: тільки id пропозиції — сервер сам
// перезбирає її з БД, перевіряє актуальність і проводить ідемпотентно.
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await req.json().catch(() => ({})) as { id?: unknown };
  if (typeof id !== 'string' || !id || id.length > 200) return NextResponse.json({ error: 'Немає id пропозиції' }, { status: 400 });
  const res = await applyReconFix(id, auth.user.email ?? 'admin');
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
