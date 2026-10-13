import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

// Тред чату сайту для правої панелі розділу «Чати». Відкриття — це перегляд:
// лічильник непрочитаних обнуляємо тут, як робила колишня окрема сторінка.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createServiceClient();
  const [{ data: session }, { data: messages }] = await Promise.all([
    db.from('chat_sessions').select('id, status, ai_enabled, created_at, last_message_at').eq('id', id).maybeSingle(),
    db.from('chat_messages').select('id, role, content, created_at').eq('session_id', id).order('created_at', { ascending: true }).limit(500),
  ]);
  if (!session) return NextResponse.json({ error: 'Чат не знайдено' }, { status: 404 });

  await db.from('chat_sessions').update({ unread_count: 0 }).eq('id', id);

  return NextResponse.json({ session, messages: messages ?? [] });
}
