import { NextRequest, NextResponse } from 'next/server';
import { refreshNovapayBalance, getNovapayLiveBalance, refreshNovapayRegisters } from '../../../../lib/novapay-api';
import { ingestNovapayStatement, postNpPayouts } from '../../../../lib/novapay-ingest';
import { postNovapayAutoTopups } from '../../../../lib/novapay-autopost';
import { createServiceClient } from '../../../../lib/supabase';
import { loadNpCodOrders, unsettledNpCod, formatUnsettledAlert } from '../../../../lib/novapay-cod-watch';
import { alertAdmin } from '../../../../lib/alert';
import { cronAuthorized } from '../../../../lib/cron-auth';

// Оновлення кешу живого балансу NovaPay. Окремим кроном, бо їхній SOAP
// відповідає по 8–30+ с на виклик — сторінки читають лише кеш.
//
// Одна невдача не критична (лишиться попередня цифра), тож не алертимо на
// кожен їхній лаг. Але й мовчати не можна: коли ротація refresh-токена
// зламалась 12.08, крон падав п'ять діб, а «Огляд» усі ці дні показував
// стару цифру як живу. Тому алертимо, коли кеш прострочив кілька годин —
// це вже не лаг, а зламана інтеграція.
//
// Розклад (vercel.json) — 4 рази на день, 8/11/14/18 за Києвом, а не щогодини:
// кожна автентифікація — ротація одноразового токена, і кожна втрачена
// відповідь НП убиває доступ (20.10.2026). Крон пошти (:20 після 5/8/11 UTC)
// встигає взяти вже виданий jwt. Мертвий токен сповіщається одразу
// (lib/novapay-api alertDeadToken), тож поріг нижче — лише для інших збоїв, і він
// покриває нічну паузу 15→05 UTC.

export const maxDuration = 300;

const STALE_ALERT_MS = 15 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!cronAuthorized(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = await refreshNovapayBalance();
  // Дати/суми реєстрів виплат наложки — кеш для «Огляду»
  const registers = await refreshNovapayRegisters();

  // Виписка → облік: виплати за реєстрами по ЕН (DR novapay + DR logistics[np] / CR np:cod).
  // Окремі try: збій виписки не має ховати збій балансу і навпаки.
  let ingest: unknown = null, payouts: unknown = null, autopost: unknown = null;
  try {
    ingest = await ingestNovapayStatement(10);
    payouts = await postNpPayouts();
    // Поповнення балансів Rozetka/Prom — за правилом, без людини (lib/novapay-autopost)
    autopost = await postNovapayAutoTopups();
  } catch (err) {
    console.error('[novapay-statement]', err instanceof Error ? err.message : err);
    ingest = { error: err instanceof Error ? err.message : String(err) };
  }
  // Тиша — не успіх: якщо гроші за врученою наложкою не дійшли, np:cod тихо
  // росте. Питаємо саме про це, по кожному замовленню (lib/novapay-cod-watch);
  // попередня перевірка порівнювала два вікна різної довжини й сипала хибними
  // тривогами в дні, коли НП-наложок просто не вручали.
  try {
    const db = createServiceClient();
    const now = new Date();
    const stuck = unsettledNpCod(await loadNpCodOrders(db), now);
    if (stuck.length) {
      const { title, body } = formatUnsettledAlert(stuck, now);
      alertAdmin(title, body);
    }
  } catch { /* лише сигнал */ }

  if (balance === null) {
    const cached = await getNovapayLiveBalance();
    const age = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Infinity;
    if (!(age < STALE_ALERT_MS)) {
      const since = cached ? new Date(cached.fetchedAt).toISOString().slice(0, 16).replace('T', ' ') : 'ніколи';
      alertAdmin('NovaPay: живий баланс не оновлюється', `Останнє успішне оновлення: ${since} (UTC). Якщо НовоПей відкидає токен — окреме сповіщення «доступ API втрачено»; інакше це збій на їхньому боці або в мережі.`);
    }
  }

  return NextResponse.json({ ok: balance !== null, balance, registers: registers ? { lastDate: registers.lastDate, count: registers.payouts.length } : null, ingest, payouts, autopost });
}

export const POST = GET;
