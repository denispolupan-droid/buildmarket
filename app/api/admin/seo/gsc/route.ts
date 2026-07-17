import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '../../../../../lib/check-admin';
import { getQueries } from '../../../../../lib/gsc';

export const runtime = 'nodejs';

// Запити з Search Console для панелі "Дожим" (читання, безкоштовно)
export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  try {
    const rows = await getQueries({
      days: Number(sp.get('days') ?? 28),
      minPosition: Number(sp.get('min') ?? 8),
      maxPosition: Number(sp.get('max') ?? 35),
      limit: Number(sp.get('limit') ?? 30),
    });
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
