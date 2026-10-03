import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { markRozetkaChatRead } from '../../../../../lib/rozetka-api';
import { markPromMessageRead } from '../../../../../lib/prom-api';
import { markChatSeen } from '../../../../../lib/marketplace-chat-seen';
import { loadMarketplaceThread } from '../../../../../lib/marketplace-chat-thread';

// Тред одного чату (живі дані). Відкриття треда одразу позначає вхідні
// повідомлення прочитаними на площадці — щоб лічильники не «висіли».

export type { MarketplaceChatMessage } from '../../../../../lib/marketplace-chat-thread';

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
    const thread = await loadMarketplaceThread(mp, id);
    const { messages, receiverId, contact } = thread;

    if (mp === 'rozetka') {
      // Позначаємо прочитаним у кабінеті (не валимо тред, якщо не вийшло)
      markRozetkaChatRead(Number(id)).catch(() => {});
    } else {
      // Позначаємо вхідні прочитаними (до 20 за раз, щоб не довбати API)
      await Promise.allSettled(thread.promUnreadIncoming.slice(-20).map(mid => markPromMessageRead(mid)));
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
