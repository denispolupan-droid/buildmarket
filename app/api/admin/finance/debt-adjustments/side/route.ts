import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { sideState, openItems } from '../../../../../../lib/accounting/debt-adjustment';
import type { DebtSide } from '../../../../../../lib/accounting/debt-adjustment-rules';

// Стан однієї сторони для форми: сальдо контрагента, а без замовлення — ще й
// його замовлення з розкладом «продаж / отримано / відкрито», щоб вибрати.
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const account = sp.get('account');
  const party   = sp.get('party')?.trim() ?? '';
  const orderId = sp.get('order_id')?.trim() || null;
  if ((account !== 'customer' && account !== 'supplier') || !party) {
    return NextResponse.json({ error: 'account і party обов’язкові' }, { status: 400 });
  }
  const side: DebtSide = { account, party, orderId };
  const db = createServiceClient();
  try {
    const [state, items] = await Promise.all([
      sideState(db, side),
      account === 'customer' && !orderId ? openItems(db, side) : Promise.resolve([]),
    ]);
    return NextResponse.json({ state, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
