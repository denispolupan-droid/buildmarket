import { NextResponse } from 'next/server';
import { syncPromOrders } from '../../../../../lib/prom-sync';
import { requireStaff } from '../../../../../lib/auth-guard';
import { withApi } from '../../../../../lib/api-handler';

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

async function _POST() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPromOrders();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withApi('admin/prom/sync', _POST);
