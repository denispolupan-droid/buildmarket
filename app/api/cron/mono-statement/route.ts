import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { ingestMonoTxn } from '../../../../lib/mono-ingest';
import { alertAdmin } from '../../../../lib/alert';

// Крон-реконсиляція виписки ФОП Monobank — страховка на випадок пропущеного/
// вимкненого вебхука. Тягне виписку за останні ~2 доби і прогоняє через той самий
// ingestMonoTxn (дедуп по id → вже зараховане пропускається). Monobank Personal:
// не частіше 1 запиту/60с на функцію, тому крон раз на 30 хв безпечний.

const MONO_STATEMENT_DAYS = 2;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.MONOBANK_PERSONAL_TOKEN;
  if (!token) return NextResponse.json({ error: 'MONOBANK_PERSONAL_TOKEN не налаштований' }, { status: 503 });

  const db = createServiceClient();
  const { data: acctRow } = await db.from('app_settings').select('value').eq('key', 'mono_fop_account_id').maybeSingle();
  const account = acctRow?.value;
  if (!account) return NextResponse.json({ error: 'mono_fop_account_id не налаштований у app_settings' }, { status: 503 });

  const to   = Math.floor(Date.now() / 1000);
  const from = to - MONO_STATEMENT_DAYS * 86400;

  const res = await fetch(`https://api.monobank.ua/personal/statement/${account}/${from}/${to}`, {
    headers: { 'X-Token': token },
  });
  const text = await res.text();
  if (!res.ok) {
    // 429 (rate limit) — не алертимо, наступний запуск добере
    if (res.status !== 429) alertAdmin('Cron: реконсиляція Monobank впала', `${res.status} — ${text.slice(0, 200)}`);
    return NextResponse.json({ error: `statement ${res.status}` }, { status: res.status === 429 ? 200 : res.status });
  }

  let items: Parameters<typeof ingestMonoTxn>[1][] = [];
  try { items = JSON.parse(text); } catch { return NextResponse.json({ error: 'parse' }, { status: 200 }); }
  if (!Array.isArray(items)) return NextResponse.json({ ok: true, matched: 0, unmatched: 0, skipped: 0 });

  let matched = 0, unmatched = 0, skipped = 0;
  for (const item of items) {
    const r = await ingestMonoTxn(db, item, account);
    if (r.status === 'matched') matched++;
    else if (r.status === 'unmatched') unmatched++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, total: items.length, matched, unmatched, skipped });
}

// pg_cron дзвонить через net.http_post (POST) — потрібен той самий метод.
export const POST = GET;
