import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { customer_id, amount, description } = await req.json().catch(() => ({}));
  const sum = Math.round(Number(amount) * 100) / 100;
  if (!customer_id || !Number.isFinite(sum) || sum <= 0 || sum > 1_000_000) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  // Ручне зарахування переказу нічим не прив'язане до рядка виписки, тож подвійний
  // клік або повторне зарахування того самого переказу давало партнеру гроші двічі.
  // Та сама сума тому самому партнеру за 10 хвилин — вважаємо повтором.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from('partner_balance_transactions')
    .select('id')
    .eq('customer_id', customer_id)
    .eq('tx_type', 'top_up')
    .eq('amount', sum)
    .gte('created_at', since)
    .limit(1);
  if (recent?.length) {
    return NextResponse.json(
      { error: `Поповнення на ${sum} ₴ цьому партнеру вже зараховано менше 10 хвилин тому. Якщо це інший переказ — зачекайте або змініть суму.` },
      { status: 409 },
    );
  }

  const { error } = await db.from('partner_balance_transactions').insert({
    customer_id,
    tx_type:     'top_up',
    amount:      sum,
    description: description || 'Поповнення балансу (адмін)',
    created_by:  user.email ?? 'admin',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
