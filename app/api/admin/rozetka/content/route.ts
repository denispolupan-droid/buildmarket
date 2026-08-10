import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getRozetkaContentChanges, getRozetkaGoods, buildContentSummary } from '../../../../../lib/rozetka-content';

export const dynamic = 'force-dynamic';

/**
 * Стан контенту карток на Rozetka: заявки на зміну + за що знято поле.
 * Дані живі (кабінет — джерело правди), тому нічого не кешуємо: розділ
 * відкривають саме тоді, коли хочуть побачити поточний стан.
 */
export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  try {
    const [changes, goods] = await Promise.all([getRozetkaContentChanges(), getRozetkaGoods()]);
    return NextResponse.json(buildContentSummary(changes, goods, new Date().toISOString()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
