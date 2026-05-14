import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../../../lib/telegram';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `Ти — AI-помічник FIXLINE, B2B-платформи для оптових закупівель будівельної хімії в Україні (fixline.com.ua).

Асортимент: герметики (акрилові, силіконові, поліуретанові), монтажна піна, рідкі цвяхи (будівельний клей), ґрунтовки, допоміжні матеріали.

Формати роботи з клієнтами:
- Роздріб — без реєстрації через розділ Магазин
- Опт (B2B) — після реєстрації та верифікації, оптові ціни та умови
- Дропшип — програма для перепродажу без власного складу

Доставка: Нова Пошта по всій Україні.

Правила відповіді:
- Відповідай мовою запиту (українська або російська)
- Будь коротким та конкретним
- Не вигадуй конкретних цін — пропонуй уточнити у менеджера
- Якщо питання виходить за рамки компетенції — пропонуй залишити контакти для зворотного зв'язку`;

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json() as { sessionId?: string; message: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'empty message' }, { status: 400 });
    }

    let session: { id: string; unread_count: number } | null = null;
    let isNew = false;

    if (sessionId) {
      const { data } = await db.from('chat_sessions').select('id, unread_count').eq('id', sessionId).single();
      session = data;
    }

    if (!session) {
      isNew = true;
      const visitorId = sessionId ?? crypto.randomUUID();
      const { data, error } = await db
        .from('chat_sessions')
        .insert({ visitor_id: visitorId })
        .select('id, unread_count')
        .single();
      if (error) return NextResponse.json({ error: `db_session: ${error.message}` }, { status: 500 });
      session = data;
    }

    await db.from('chat_messages').insert({ session_id: session!.id, role: 'user', content: message });

    const { data: history } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session!.id)
      .order('created_at', { ascending: true })
      .limit(30);

    let reply: string;
    let mode: 'ai' | 'manager' = 'ai';

    try {
      const aiResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: (history ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });
      reply = aiResponse.content[0]?.type === 'text' ? aiResponse.content[0].text : '';
    } catch {
      mode = 'manager';
      reply = 'Зараз AI-помічник недоступний — передаю вас до менеджера. Ми відповімо найближчим часом у цьому чаті.';
    }

    await Promise.all([
      db.from('chat_messages').insert({ session_id: session!.id, role: 'assistant', content: reply }),
      db.from('chat_sessions').update({
        last_message_at: new Date().toISOString(),
        unread_count: session!.unread_count + 1,
      }).eq('id', session!.id),
    ]);

    const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminId) {
      if (mode === 'manager') {
        sendTelegram(
          adminId,
          `🔴 <b>Потрібна відповідь менеджера!</b>\n\n💬 ${message}\n\n🔗 fixline.com.ua/admin/chat/${session!.id}`,
        );
      } else if (isNew) {
        sendTelegram(
          adminId,
          `💬 <b>Новий чат на сайті</b>\n\n💬 ${message}\n\n🔗 fixline.com.ua/admin/chat/${session!.id}`,
        );
      }
    }

    return NextResponse.json({ sessionId: session!.id, reply, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[chat]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ messages: [] });

  const { data: messages } = await db
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: messages ?? [] });
}
