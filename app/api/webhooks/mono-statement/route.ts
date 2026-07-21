import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { ingestMonoTxn } from '../../../../lib/mono-ingest';
import { getMonoWebhookSecret, getMonoFopAccount } from '../../../../lib/mono-config';

// Вебхук Monobank Personal API: банк шле POST на кожну нову транзакцію у форматі
// { type: "StatementItem", data: { account, statementItem } }. Перед активацією
// Monobank робить GET на цей URL — маємо відповісти строго 200.
//
// Personal-вебхук НЕ підписаний, тому автентичність забезпечуємо секретом у
// query (?t=<MONO_WEBHOOK_SECRET>) — його знає лише зареєстрований у банку URL.
// Обробляємо тільки рахунок ФОП (mono_fop_account_id); транзакції особистої
// картки ігноруємо. Завжди відповідаємо 200 (best-effort), бо пропущене добере
// крон-реконсиляція — інакше банк вимкне вебхук після 3 невдалих доставок.

async function secretOk(req: NextRequest, db: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const secret = await getMonoWebhookSecret(db);
  return !!secret && new URL(req.url).searchParams.get('t') === secret;
}

export async function GET(req: NextRequest) {
  // Валідаційний GET від Monobank. 200 лише для нашого URL із правильним секретом.
  const db = createServiceClient();
  if (!(await secretOk(req, db))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const db = createServiceClient();
  if (!(await secretOk(req, db))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json().catch(() => null) as
      | { type?: string; data?: { account?: string; statementItem?: Record<string, unknown> } }
      | null;

    if (body?.type === 'StatementItem' && body.data?.statementItem) {
      const fopAccount = (await getMonoFopAccount(db)) ?? '';
      const account = body.data.account ?? '';

      // Обробляємо лише рахунок ФОП (не особисту картку)
      if (fopAccount && account === fopAccount) {
        const item = body.data.statementItem as unknown as Parameters<typeof ingestMonoTxn>[1];
        await ingestMonoTxn(db, item, account);
      }
    }
  } catch (err) {
    console.error('[mono-webhook]', err);
  }

  // Завжди 200 — щоб банк не вимкнув вебхук; пропущене добере реконсиляція.
  return NextResponse.json({ ok: true });
}
