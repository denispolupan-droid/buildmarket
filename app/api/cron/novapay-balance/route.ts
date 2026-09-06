import { NextRequest, NextResponse } from 'next/server';
import { refreshNovapayBalance, getNovapayLiveBalance, refreshNovapayRegisters } from '../../../../lib/novapay-api';
import { ingestNovapayStatement, postNpPayouts } from '../../../../lib/novapay-ingest';
import { createServiceClient } from '../../../../lib/supabase';
import { alertAdmin } from '../../../../lib/alert';

// Оновлення кешу живого балансу NovaPay. Окремим кроном, бо їхній SOAP
// відповідає по 8–30+ с на виклик — сторінки читають лише кеш.
//
// Одна невдача не критична (лишиться попередня цифра), тож не алертимо на
// кожен їхній лаг. Але й мовчати не можна: коли ротація refresh-токена
// зламалась 12.08, крон падав п'ять діб, а «Огляд» усі ці дні показував
// стару цифру як живу. Тому алертимо, коли кеш прострочив кілька годин —
// це вже не лаг, а зламана інтеграція.

export const maxDuration = 300;

const STALE_ALERT_MS = 3 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = await refreshNovapayBalance();
  // Дати/суми реєстрів виплат наложки — кеш для «Огляду»
  const registers = await refreshNovapayRegisters();

  // Виписка → облік: виплати за реєстрами по ЕН (DR novapay + DR logistics[np] / CR np:cod).
  // Окремі try: збій виписки не має ховати збій балансу і навпаки.
  let ingest: unknown = null, payouts: unknown = null;
  try {
    ingest = await ingestNovapayStatement(10);
    payouts = await postNpPayouts();
  } catch (err) {
    console.error('[novapay-statement]', err instanceof Error ? err.message : err);
    ingest = { error: err instanceof Error ? err.message : String(err) };
  }
  // Тиша — не успіх: якщо два дні жодної виплати при вручених наложках, виписка
  // або інтеграція зламались, а np:cod тихо росте.
  try {
    const db = createServiceClient();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const [{ count: payouts }, { count: delivered }] = await Promise.all([
      db.from('novapay_txns').select('id', { count: 'exact', head: true }).eq('kind', 'cod_payout').gte('txn_date', twoDaysAgo),
      db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').eq('payment_type', 'cod')
        .in('delivery_type', ['nova', 'nova_poshta']).gte('delivered_at', new Date(Date.now() - 4 * 86400000).toISOString()),
    ]);
    if ((payouts ?? 0) === 0 && (delivered ?? 0) > 0) {
      alertAdmin('НоваПей: два дні без виплат наложки', `За 4 дні вручено ${delivered} наложок, а у виписці NovaPay з ${twoDaysAgo} жодної виплати за реєстром. Перевір виписку/інтеграцію — np:cod росте.`);
    }
  } catch { /* лише сигнал */ }

  if (balance === null) {
    const cached = await getNovapayLiveBalance();
    const age = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Infinity;
    if (!(age < STALE_ALERT_MS)) {
      const since = cached ? new Date(cached.fetchedAt).toISOString().slice(0, 16).replace('T', ' ') : 'ніколи';
      alertAdmin('NovaPay: живий баланс не оновлюється', `Останнє успішне оновлення: ${since} (UTC). Перевір novapay_refresh_token у app_settings — ротація токена рветься, якщо натиснути «Згенерувати» в кабінеті.`);
    }
  }

  return NextResponse.json({ ok: balance !== null, balance, registers: registers ? { lastDate: registers.lastDate, count: registers.payouts.length } : null, ingest, payouts });
}

export const POST = GET;
