import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { syncEpicentrOrders } from '../../../../../lib/epicentr-sync';

// Ручний синк замовлень Епіцентру (кнопка на дашборді).
export async function POST() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await syncEpicentrOrders());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
