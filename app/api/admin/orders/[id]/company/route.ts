import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { withApi } from '../../../../../../lib/api-handler';
import { createServiceClient, type TableUpdate } from '../../../../../../lib/supabase-service';
import { lookupCompanyByCode, normalizeCompanyCode } from '../../../../../../lib/company-lookup';
import { companyForOrder } from '../../../../../../lib/customer-company';
import { log } from '../../../../../../lib/log';

/**
 * «Заповнити реквізити» в картці замовлення (13.11.2026): код ЄДРПОУ/ІПН з
 * коментаря покупця → офіційна назва (Нова Пошта) → рахунок на підприємство +
 * код і юр. назва в картці контрагента (lib/customer-company). Не знайшла НП
 * (буває для ФОП) — беремо назву, яку надіслав менеджер (з коментаря).
 */
async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { code?: string; name?: string };
  const code = normalizeCompanyCode(body.code);
  if (!code) return NextResponse.json({ error: 'Код має бути 8 (ЄДРПОУ) або 10 (ІПН) цифр' }, { status: 400 });

  const db = createServiceClient();
  const { data: order } = await db.from('orders').select('id, order_number, customer_id').eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const found = await lookupCompanyByCode(code);
  const name = found?.shortName || String(body.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return NextResponse.json({ error: `За кодом ${code} Нова Пошта нічого не знайшла — впишіть назву вручну в картці контрагента` }, { status: 404 });

  const r = await companyForOrder(db, order.customer_id, { name, code });
  const { error } = await db.from('orders').update(r.orderPatch as TableUpdate<'orders'>).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  log.info('order.company_filled', { order: order.order_number, code, source: found ? 'nova_poshta' : 'manual', linked: Boolean(r.linkedCustomerId) });
  return NextResponse.json({ ok: true, name, fullName: found?.fullName ?? null, code, verified: Boolean(found), linked: Boolean(r.linkedCustomerId), filledCustomer: r.filledCustomer });
}

export const POST = withApi('admin/orders/[id]/company', _POST);
