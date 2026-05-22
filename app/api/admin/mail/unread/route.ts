import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { zohoFetch, getAccountId, getTokenRow } from '../../../../../lib/zoho-mail';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    const tokens = await getTokenRow();
    if (!tokens) return NextResponse.json({ count: 0 });

    const accountId = await getAccountId();

    // Отримуємо папки і шукаємо Inbox folderId
    const foldersData = await zohoFetch(`/accounts/${accountId}/folders`);
    const folders: Record<string, unknown>[] = foldersData?.data ?? [];
    const inbox = folders.find(f => String(f.folderName ?? '').toLowerCase() === 'inbox');
    if (!inbox) return NextResponse.json({ count: 0 });

    const folderId = inbox.folderId as string;

    // Рахуємо непрочитані через повідомлення зі статусом unread
    const msgsData = await zohoFetch(
      `/accounts/${accountId}/messages/view?folderId=${folderId}&limit=50&start=0`
    );
    const messages: Record<string, unknown>[] = msgsData?.data ?? [];
    const zohoUnread = messages.filter(m => m.status === '0' || m.status === 0);
    if (!zohoUnread.length) return NextResponse.json({ count: 0 });

    // Subtract locally marked as read
    const ids = zohoUnread.map(m => m.messageId as string).filter(Boolean);
    const { data: readRows } = await db.from('mail_read_messages').select('message_id').in('message_id', ids);
    const readSet = new Set((readRows ?? []).map(r => r.message_id));
    const count = zohoUnread.filter(m => !readSet.has(m.messageId as string)).length;

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
