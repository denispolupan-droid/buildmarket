import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { loadMarketplaceThread } from '../../../../../lib/marketplace-chat-thread';
import { getOrCreateDraft } from '../../../../../lib/marketplace-chat-assistant';
import { awaitingOurReply, lastIncomingAt } from '../../../../../lib/marketplace-chat-draft-rules';

// Чернетка відповіді покупцю від ШІ-помічника. Нічого на площадку не пише:
// повертає текст менеджеру, відправка — окремо через /reply.

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    mp?: string; id?: string; orderNumber?: number | null; ourOrderId?: string | null;
    subject?: string | null; force?: boolean;
  };
  const mp = body.mp;
  const id = body.id ?? '';
  if ((mp !== 'rozetka' && mp !== 'prom') || !id) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  try {
    const thread = await loadMarketplaceThread(mp, id);
    if (!awaitingOurReply(thread.messages)) {
      return NextResponse.json({ draft: null, reason: 'Останнє повідомлення — наше, відповідати нема на що' });
    }
    const key = lastIncomingAt(thread.messages);
    if (!key) return NextResponse.json({ draft: null, reason: 'У треді немає повідомлень покупця' });

    const draft = await getOrCreateDraft(
      { mp, chatId: id, lastIncomingAt: key },
      {
        mp, messages: thread.messages, contact: thread.contact, phone: thread.phone,
        orderNumber: body.orderNumber ?? null, ourOrderId: body.ourOrderId ?? null, subject: body.subject ?? null,
      },
      { force: Boolean(body.force) },
    );
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-chats/draft]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
