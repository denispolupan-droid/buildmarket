import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { pushPromStock } from '../../../../../lib/prom-stock-push';
import { withApi } from '../../../../../lib/api-handler';

// Ручний пуш залишків у Prom через API (кнопка на дашборді Prom).
async function _POST() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  try {
    const result = await pushPromStock();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withApi('admin/prom/push-stock', _POST);
