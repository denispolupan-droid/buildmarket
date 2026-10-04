import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram, answerCallbackQuery } from '../../../../lib/telegram';
import { parseDraftCallback } from '../../../../lib/marketplace-chat-telegram-rules';
import { sendDraftFromTelegram, discardDraftFromTelegram } from '../../../../lib/marketplace-chat-telegram';

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

  // Кнопки під алертом про чат МП («Надіслати як є» / «Пропустити»).
  // Приймаємо лише з адмін-чату: callback_data легко підробити, chat.id — ні.
  const cb = body?.callback_query;
  if (cb) {
    const fromAdmin = String(cb.message?.chat?.id ?? '') === String(process.env.TELEGRAM_ADMIN_CHAT_ID ?? '');
    const parsed = fromAdmin ? parseDraftCallback(cb.data) : null;
    if (!parsed) { await answerCallbackQuery(cb.id); return NextResponse.json({ ok: true }); }
    try {
      const r = parsed.action === 'send' ? await sendDraftFromTelegram(parsed.draftId) : await discardDraftFromTelegram(parsed.draftId);
      await answerCallbackQuery(cb.id, r.message);
    } catch (err) {
      console.error('[telegram webhook] draft callback failed:', err);
      await answerCallbackQuery(cb.id, 'Не вийшло — відкрийте чат в адмінці');
    }
    return NextResponse.json({ ok: true });
  }

  const message = body?.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat?.id;
  const text: string = message.text ?? '';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (text.startsWith('/start ')) {
    const orderId = text.slice(7).trim();
    if (!orderId || !chatId || !UUID_RE.test(orderId)) return NextResponse.json({ ok: true });

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
