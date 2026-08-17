import { NextRequest, NextResponse } from 'next/server';
import { refreshNovapayBalance, getNovapayLiveBalance } from '../../../../lib/novapay-api';
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

  if (balance === null) {
    const cached = await getNovapayLiveBalance();
    const age = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Infinity;
    if (!(age < STALE_ALERT_MS)) {
      const since = cached ? new Date(cached.fetchedAt).toISOString().slice(0, 16).replace('T', ' ') : 'ніколи';
      alertAdmin('NovaPay: живий баланс не оновлюється', `Останнє успішне оновлення: ${since} (UTC). Перевір novapay_refresh_token у app_settings — ротація токена рветься, якщо натиснути «Згенерувати» в кабінеті.`);
    }
  }

  return NextResponse.json({ ok: balance !== null, balance });
}

export const POST = GET;
