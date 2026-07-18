import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const token = process.env.MONOBANK_PERSONAL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'MONOBANK_PERSONAL_TOKEN не налаштований. Додайте його в Налаштування → Vercel env.' }, { status: 503 });
  }

  const fromTs = Math.floor(new Date(from).getTime() / 1000);
  // to — кінець дня
  const toTs   = Math.floor(new Date(to + 'T23:59:59Z').getTime() / 1000);

  // Monobank API: GET /personal/statement/{account}/{from}/{to}
  // account = "0" → default account
  const url = `https://api.monobank.ua/personal/statement/0/${fromTs}/${toTs}`;

  const res = await fetch(url, {
    headers: { 'X-Token': token },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[bank-statement] monobank error:', res.status, text);
    return NextResponse.json({ error: `Monobank API: ${res.status} — ${text}` }, { status: res.status });
  }

  const transactions = await res.json();
  return NextResponse.json({ transactions });
}
