import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getRozetkaSlaReport } from '../../../../../lib/rozetka-sla';
import { withApi } from '../../../../../lib/api-handler';

// Звіт живий: ходить у Rozetka по всіх товарах (≈40 сторінок), тож ніякого кешу
// сторінки. Викликається кнопкою, а не при кожному відкритті екрана.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function _GET() {
  const gate = await requireStaff('admin', 'manager');
  if (!gate.ok) return gate.response;

  try {
    return NextResponse.json(await getRozetkaSlaReport());
  } catch (err) {
    console.error('[sla-report]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Не вдалося отримати звіт' },
      { status: 502 },
    );
  }
}

export const GET = withApi('admin/rozetka/sla-report', _GET);
