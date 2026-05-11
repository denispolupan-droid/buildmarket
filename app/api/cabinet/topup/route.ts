import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
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

    const token = (process.env.MONOBANK_API_TOKEN ?? '').replace(/﻿/g, '').replace(/[^\x20-\x7E]/g, '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Еквайринг не налаштовано' }, { status: 500 });
    }

    const reference = `topup_${customer.id}_${Date.now()}`;
    const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';

    let monoRes: Response;
    let monoData: any;

    try {
      monoRes = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
        method: 'POST',
        headers: { 'X-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:   Math.round(amount * 100),
          ccy:      980,
          merchantPaymInfo: {
            reference,
            destination: 'Поповнення балансу FIXLINE',
            comment:     `Поповнення балансу партнера — ${customer.name}`,
          },
          redirectUrl: `${siteUrl}/cabinet/balance?topup=success`,
          webHookUrl:  `${siteUrl}/api/webhooks/monobank`,
        }),
      });
      monoData = await monoRes.json();
    } catch (e) {
      return NextResponse.json({ error: `Помилка зв'язку з Monobank: ${e}` }, { status: 502 });
    }

    if (!monoRes.ok || !monoData.pageUrl) {
      return NextResponse.json(
        { error: `Monobank: ${monoData.errText ?? monoData.errorDescription ?? JSON.stringify(monoData)}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ pageUrl: monoData.pageUrl, invoiceId: monoData.invoiceId });

  } catch (e) {
    return NextResponse.json({ error: `Внутрішня помилка: ${e}` }, { status: 500 });
  }
}
