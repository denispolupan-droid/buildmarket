import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getRozetkaChatThread, markRozetkaChatRead } from '../../../../../lib/rozetka-api';
import { getPromChatHistory, markPromMessageRead } from '../../../../../lib/prom-api';
import { markChatSeen } from '../../../../../lib/marketplace-chat-seen';

// Тред одного чату (живі дані). Відкриття треда одразу позначає вхідні
// повідомлення прочитаними на площадці — щоб лічильники не «висіли».

export type MarketplaceChatMessage = {
  body: string;
  at: string | null;
  fromUs: boolean;
  author: string | null;   // 'Система' для сервісних повідомлень Rozetka
};

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const mp = sp.get('mp');
  const id = sp.get('id') ?? '';
  if ((mp !== 'rozetka' && mp !== 'prom') || !id) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  try {
    const messages: MarketplaceChatMessage[] = [];
    let receiverId: number | null = null;
    let contact: string | null = null;

    if (mp === 'rozetka') {
      const chat = await getRozetkaChatThread(Number(id));
      receiverId = chat.user_id ?? chat.user?.id ?? null;
      contact = chat.user?.contact_fio?.trim() || null;
      for (const m of chat.messages ?? []) {
        messages.push({
          body: m.body ?? '',
          at: m.created ?? null,
          fromUs: m.seller_id != null,
          author: m.seller_id != null ? 'Ми' : m.sender === 0 ? 'Система' : contact,
        });
      }
      // Позначаємо прочитаним у кабінеті (не валимо тред, якщо не вийшло)
      markRozetkaChatRead(Number(id)).catch(() => {});
    } else {
      const history = await getPromChatHistory(id);
      // room_ident = {buyer_user_id}_{company_id}_buyer → перша частина = покупець
      const buyerIdent = id.split('_')[0];
      const unreadIncoming: number[] = [];
      for (const m of history) {
        const fromUs = m.user_ident != null && String(m.user_ident) !== buyerIdent;
        messages.push({
          body: m.body ?? (m.type !== 'message' ? `[${m.type}]` : ''),
          at: m.date_sent ?? null,
          fromUs,
          author: fromUs ? 'Ми' : (m.user_name ?? null),
        });
        if (!fromUs && m.status === 'new') unreadIncoming.push(m.id);
        if (!fromUs && !contact && m.user_name) contact = m.user_name;
      }
      // Позначаємо вхідні прочитаними (до 20 за раз, щоб не довбати API)
      await Promise.allSettled(unreadIncoming.slice(-20).map(mid => markPromMessageRead(mid)));
    }

    // Наш власний признак прочитаності. Запамʼятовуємо мітку updated чату, яку
    // клієнт щойно показував у списку — саме з нею список і звіряється. Мітка
    // останнього повідомлення тут була б іншим полем: у чата updated може
    // відрізнятись, і тоді рядок лишався б підсвіченим назавжди. Якщо клієнт
    // мітку не передав (прямий виклик) — беремо час найсвіжішого повідомлення.
    const latestMsg = messages.reduce<string | null>((max, m) => (m.at && (!max || m.at > max) ? m.at : max), null);
    await markChatSeen(mp, id, sp.get('updatedAt') ?? latestMsg).catch(() => {});

    return NextResponse.json({ messages, receiverId, contact });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-chats/thread]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
