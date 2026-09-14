import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../lib/auth-guard';
import { createDropshipOrder, getDropshipCustomer } from '../../../../lib/dropship-order-create';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as
    { items?: unknown; recipient?: unknown; comment?: unknown; has_cod?: unknown } | null;
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Немає товарів' }, { status: 400 });
  }

  const customer = await getDropshipCustomer(serviceClient, auth.user.id);
  if (!customer) {
    return NextResponse.json({ error: 'Партнера не знайдено. Зверніться до адміністратора.' }, { status: 404 });
  }

  const res = await createDropshipOrder(serviceClient, {
    customer,
    fallbackEmail: auth.user.email ?? null,
    items:         body.items,
    recipient:     body.recipient,
    hasCod:        body.has_cod !== false,
    comment:       typeof body.comment === 'string' ? body.comment : null,
    source:        'form',
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, order_number: res.order_number });
}
