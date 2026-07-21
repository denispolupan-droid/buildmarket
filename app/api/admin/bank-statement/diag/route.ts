import { NextRequest, NextResponse } from 'next/server';
import { SELLER } from '../../../../../lib/company';

// ТИМЧАСОВИЙ діагностик: перевіряємо, чи Monobank Personal API (токен у Vercel)
// бачить потрібний рахунок ФОП і поступлення оплат за рахунками. Захищено
// CRON_SECRET (щоб можна було дьорнути з сервера/скрипта), лише читання.
//
//   GET ?  (без параметрів)        → /personal/client-info: список рахунків токена
//   GET ?account=<id>&days=<n>     → /personal/statement: вхідні за N діб (деф. 2)
//
// Monobank Personal обмеження: 1 запит / 60 сек на токен, тому робимо ОДИН запит
// за виклик (client-info АБО statement), а два виклики розносимо на ≥60 сек.

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.MONOBANK_PERSONAL_TOKEN;
  if (!token) return NextResponse.json({ error: 'MONOBANK_PERSONAL_TOKEN не налаштований' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const account = searchParams.get('account');

  // ── Statement для конкретного рахунку ─────────────────────────────────────
  if (account) {
    const days = Math.min(31, Math.max(1, parseInt(searchParams.get('days') ?? '2', 10)));
    const toTs   = Math.floor(Date.now() / 1000);
    const fromTs = toTs - days * 86400;
    const res = await fetch(`https://api.monobank.ua/personal/statement/${account}/${fromTs}/${toTs}`, {
      headers: { 'X-Token': token },
    });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ error: `statement ${res.status}`, body: text.slice(0, 300) }, { status: res.status });
    let txns: { time: number; description?: string; comment?: string; amount: number; counterName?: string; counterIban?: string }[] = [];
    try { txns = JSON.parse(text); } catch { return NextResponse.json({ error: 'parse', body: text.slice(0, 300) }); }
    // Лише вхідні (amount > 0), стисло
    const incoming = txns.filter(t => t.amount > 0).map(t => ({
      time: new Date(t.time * 1000).toISOString(),
      amount: t.amount / 100,
      description: t.description ?? '',
      comment: t.comment ?? '',
      counterName: t.counterName ?? '',
      counterIban: t.counterIban ?? '',
    }));
    return NextResponse.json({ account, days, incoming_count: incoming.length, incoming });
  }

  // ── client-info: рахунки токена ───────────────────────────────────────────
  const res = await fetch('https://api.monobank.ua/personal/client-info', {
    headers: { 'X-Token': token },
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: `client-info ${res.status}`, body: text.slice(0, 300) }, { status: res.status });
  let info: { name?: string; accounts?: { id: string; type?: string; currencyCode?: number; iban?: string; balance?: number; maskedPan?: string[] }[] };
  try { info = JSON.parse(text); } catch { return NextResponse.json({ error: 'parse', body: text.slice(0, 300) }); }

  const sellerIban = norm(SELLER.iban);
  const accounts = (info.accounts ?? []).map(a => ({
    id: a.id,
    type: a.type,
    currencyCode: a.currencyCode,   // 980 = UAH
    iban: a.iban,
    balance: typeof a.balance === 'number' ? a.balance / 100 : null,
    matches_seller_iban: a.iban ? norm(a.iban) === sellerIban : false,
  }));

  return NextResponse.json({
    name: info.name,
    seller_iban: SELLER.iban,
    account_count: accounts.length,
    accounts,
    hint: 'Викличте ще раз з ?account=<id рахунку з matches_seller_iban=true>&days=2, щоб побачити поступлення',
  });
}
