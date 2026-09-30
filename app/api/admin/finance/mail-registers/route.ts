import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { importMailRegisters } from '../../../../../lib/mail-registers';

// Ручний запуск імпорту реєстрів з пошти (кнопка на «Банк»/«НоваПей»). Крон робить
// те саме щоранку; тут можна взяти глибше — до 60 днів.

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { days?: number; dryRun?: boolean };
  const days = Math.min(60, Math.max(1, Number(body.days) || 7));
  try {
    const res = await importMailRegisters({ days, createdBy: auth.user.email ?? 'admin', dryRun: !!body.dryRun });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
