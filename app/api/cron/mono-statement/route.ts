import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { fetchAndIngestMonoStatement, postPendingAcquiringSettlements } from '../../../../lib/mono-ingest';
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

  const db = createServiceClient();
  try {
    const summary = await fetchAndIngestMonoStatement(db, MONO_STATEMENT_DAYS);
    const acquiringPosted = await postPendingAcquiringSettlements(db);
    return NextResponse.json({ ok: true, ...summary, acquiringPosted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 429 (rate limit) — не алертимо, наступний запуск добере
    if (!/ 429 /.test(msg)) alertAdmin('Cron: реконсиляція Monobank впала', msg.slice(0, 300));
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: / 429 /.test(msg) ? 200 : 500 });
  }
}

// pg_cron дзвонить через net.http_post (POST) — потрібен той самий метод.
export const POST = GET;
