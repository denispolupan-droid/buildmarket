import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { replyRozetkaChat } from '../../../../../lib/rozetka-api';
import { sendPromChatMessage } from '../../../../../lib/prom-api';

// Відповідь покупцю в чаті маркетплейсу від імені магазину.

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as {
    mp?: string; id?: string; receiverId?: number; text?: string;
  };
  const text = (body.text ?? '').trim();
  if ((body.mp !== 'rozetka' && body.mp !== 'prom') || !body.id || !text) {
    return NextResponse.json({ error: 'Вкажіть текст повідомлення' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'Повідомлення задовге (максимум 2000 символів)' }, { status: 400 });
  }

  try {
    if (body.mp === 'rozetka') {
      if (!body.receiverId) return NextResponse.json({ error: 'Невідомий отримувач' }, { status: 400 });
      await replyRozetkaChat({ chatId: Number(body.id), receiverId: body.receiverId, body: text });
    } else {
      await sendPromChatMessage(body.id, text);
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[marketplace-chats/reply]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
