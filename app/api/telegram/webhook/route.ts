import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../../../../lib/telegram';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAYMENT_UA: Record<string, string> = {
  cod: 'Накладений платіж',
  invoice: 'Безготівковий розрахунок',
};

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = await req.json();
  const message = body?.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat?.id;
  const text: string = message.text ?? '';

  if (text.startsWith('/start ')) {
    const orderId = text.slice(7).trim();
    if (!orderId || !chatId) return NextResponse.json({ ok: true });

    const { data: order } = await admin
      .from('orders')
      .select('order_number, items, total_price, payment_type, delivery_city_name')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      await sendTelegram(chatId, '❌ Замовлення не знайдено. Скористайтеся посиланням з листа підтвердження.');
      return NextResponse.json({ ok: true });
    }

    await admin
      .from('orders')
      .update({ telegram_chat_id: String(chatId) })
      .eq('id', orderId);

    // Build items list
    const items: Array<{ name: string; brand: string; qty: number; price: number }> =
      Array.isArray(order.items) ? order.items : [];
    const itemLines = items
      .map(i => `▪️ ${i.brand} ${i.name} × ${i.qty} — ${(i.price * i.qty).toFixed(0)} ₴`)
      .join('\n');

    const payment = PAYMENT_UA[order.payment_type] ?? order.payment_type;
    const city = order.delivery_city_name ? `\n📍 ${order.delivery_city_name}` : '';

    await sendTelegram(
      chatId,
      `✅ <b>Дякуємо за замовлення №${order.order_number}!</b>\n\n${itemLines}\n\n💰 <b>Сума: ${Number(order.total_price).toFixed(0)} ₴</b>\n💳 ${payment}${city}\n\nМи повідомимо вас, коли підтвердимо та відправимо замовлення.`,
    );
  } else if (text === '/start') {
    await sendTelegram(
      chatId,
      '👋 Вітаємо в FIXLINE!\nЩоб отримати підтвердження замовлення, перейдіть за посиланням у листі підтвердження.',
    );
  }

  return NextResponse.json({ ok: true });
}
