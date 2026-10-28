import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET ?ids=id1,id2,... → { readIds: string[] }
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (!ids.length) return NextResponse.json({ readIds: [] });
  const { data } = await db.from('mail_read_messages').select('message_id').in('message_id', ids);
  return NextResponse.json({ readIds: (data ?? []).map(r => r.message_id) });
}

// POST { messageId } → mark as read
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: 'missing messageId' }, { status: 400 });
  await db.from('mail_read_messages').upsert({ message_id: messageId });
  return NextResponse.json({ ok: true });
}
