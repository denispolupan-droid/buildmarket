import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { syncEpicentrOrders } from '../../../../../lib/epicentr-sync';
import { withApi } from '../../../../../lib/api-handler';

// Ручний синк замовлень Епіцентру (кнопка на дашборді).
async function _POST() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await syncEpicentrOrders());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withApi('admin/epicentr/sync', _POST);
