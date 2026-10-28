import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { message } = await req.json() as { message?: string };

  if (!message?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const [{ error: msgErr }] = await Promise.all([
    db.from('chat_messages').insert({ session_id: id, role: 'assistant', content: message.trim() }),
    // Відповіли — отже прочитали: лічильник гасимо тут, а не лише при відкритті
    db.from('chat_sessions').update({ last_message_at: new Date().toISOString(), unread_count: 0 }).eq('id', id),
  ]);

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
