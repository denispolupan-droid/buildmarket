import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getRozetkaChatCounts } from '../../../../../lib/rozetka-api';

// Лічильник непрочитаних для бейджа в сайдбарі. Rozetka віддає готовий
// totalUnread (/messages/counts); Prom лічильника на рівні кімнат не має —
// його непрочитані видно всередині розділу.

export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  try {
    const { totalUnread } = await getRozetkaChatCounts();
    return NextResponse.json({ count: totalUnread });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
