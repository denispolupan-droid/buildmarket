import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = getRole(user);
  if (!user || (role !== 'dropship' && role !== 'wholesale')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { amount } = await req.json();
  if (!amount || amount < 500) {
    return NextResponse.json({ error: 'Мінімальна сума поповнення — 500 ₴' }, { status: 400 });
  }

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });
  }

  const reference = `topup_${customer.id}_${Date.now()}`;
  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';

  const res = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
    method: 'POST',
    headers: {
      'X-Token':     process.env.MONOBANK_API_TOKEN!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount:   Math.round(amount * 100), // копійки
      ccy:      980,                       // UAH
      merchantPaymInfo: {
        reference,
        destination: 'Поповнення балансу FIXLINE',
        comment:     `Поповнення балансу партнера — ${customer.name}`,
      },
      redirectUrl: `${siteUrl}/cabinet/balance?topup=success`,
      webHookUrl:  `${siteUrl}/api/webhooks/monobank`,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.pageUrl) {
    return NextResponse.json(
      { error: data.errText ?? 'Помилка створення платежу' },
      { status: 400 }
    );
  }

  // Зберігаємо pending транзакцію для аудиту
  await serviceClient.from('partner_balance_transactions').insert({
    customer_id: customer.id,
    tx_type:     'top_up',
    amount:      0, // буде оновлено вебхуком після оплати
    description: `Monobank invoice (очікує оплати): ${reference}`,
    created_by:  'monobank_pending',
  }).then(() => {}); // не блокуємо відповідь якщо не вдалось

  return NextResponse.json({ pageUrl: data.pageUrl, invoiceId: data.invoiceId });
}
