import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

// GET ?ids=id1,id2,... → { readIds: string[] }
async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (!ids.length) return NextResponse.json({ readIds: [] });
  const { data } = await db.from('mail_read_messages').select('message_id').in('message_id', ids);
  return NextResponse.json({ readIds: (data ?? []).map(r => r.message_id) });
}

export const GET = withApi('admin/mail/read-state', _GET);

// POST { messageId } → mark as read
async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: 'missing messageId' }, { status: 400 });
  await db.from('mail_read_messages').upsert({ message_id: messageId });
  return NextResponse.json({ ok: true });
}

export const POST = withApi('admin/mail/read-state', _POST);
