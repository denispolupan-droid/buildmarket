import { NextRequest, NextResponse } from 'next/server';
import { refreshNovapayBalance } from '../../../../lib/novapay-api';

// Оновлення кешу живого балансу NovaPay. Окремим кроном, бо їхній SOAP
// відповідає по 8–30+ с на виклик — сторінки читають лише кеш.
// Помилка тут не критична (на «Огляді» лишиться попередня цифра з міткою
// часу), тож без alertAdmin — інакше кожен їхній лаг сипав би в Telegram.

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = await refreshNovapayBalance();
  return NextResponse.json({ ok: balance !== null, balance });
}

export const POST = GET;
