import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../../../../lib/telegram';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // Verify Telegram webhook secret
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = await req.json();
  const message = body?.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat?.id;
  const text: string = message.text ?? '';

  // Handle /start ORDER_ID
  if (text.startsWith('/start ')) {
    const orderId = text.slice(7).trim();
    if (orderId && chatId) {
      const { data: order } = await admin
        .from('orders')
        .select('order_number')
        .eq('id', orderId)
        .maybeSingle();

      if (order) {
        await admin
          .from('orders')
          .update({ telegram_chat_id: String(chatId) })
          .eq('id', orderId);

        await sendTelegram(
          chatId,
          `✅ <b>Підписано на сповіщення!</b>\nВи отримуватимете оновлення про статус замовлення <b>№${order.order_number}</b> прямо тут.`,
        );
      } else {
        await sendTelegram(chatId, '❌ Замовлення не знайдено. Скористайтеся посиланням з листа підтвердження.');
      }
    }
  } else if (text === '/start') {
    await sendTelegram(
      chatId,
      '👋 Вітаємо в FIXLINE!\nЩоб підписатися на сповіщення про замовлення, перейдіть за посиланням у листі підтвердження замовлення.',
    );
  }

  return NextResponse.json({ ok: true });
}
