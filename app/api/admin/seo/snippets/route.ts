import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { ctrLosses, findDuplicates } from '../../../../../lib/seo/snippets';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Сторінки, які ранжуються, але їх не клікають, разом із фактичним
 * title/description зі сторінки. Читання чужих даних тут немає: ходимо лише
 * по власних адресах з нашої ж властивості Search Console.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  try {
    const rows = await ctrLosses({
      days: Math.min(Math.max(Number(sp.get('days') ?? 28), 1), 480),
      limit: Math.min(Number(sp.get('limit') ?? 30), 60),
      maxPosition: Number(sp.get('maxPosition') ?? 20),
      minImpressions: Number(sp.get('minImpressions') ?? 10),
    });
    return NextResponse.json({ rows, duplicates: findDuplicates(rows) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
