import { NextResponse } from 'next/server';
import { zohoFetch, getAccountId, getTokenRow } from '../../../../../lib/zoho-mail';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';

const db = createServiceClient();

// Сайдбар опитує цей роут кожні 60 с з КОЖНОЇ відкритої вкладки адмінки — без
// кешу це два виклики Zoho на вкладку на хвилину (аудит 31.10, §3 п. 8).
// Кешуємо на інстансі список непрочитаних id від Zoho на 55 с; локальне
// «прочитано» (mail_read_messages) віднімаємо щоразу, щоб лічильник гаснув
// одразу після відкриття листа, а не за хвилину.
const ZOHO_TTL_MS = 55_000;
let zohoCache: { at: number; ids: string[] } | null = null;

async function zohoUnreadIds(): Promise<string[]> {
  if (zohoCache && Date.now() - zohoCache.at < ZOHO_TTL_MS) return zohoCache.ids;
  const accountId = await getAccountId();

  // Отримуємо папки і шукаємо Inbox folderId
  const foldersData = await zohoFetch(`/accounts/${accountId}/folders`);
  const folders: Record<string, unknown>[] = foldersData?.data ?? [];
  const inbox = folders.find(f => String(f.folderName ?? '').toLowerCase() === 'inbox');
  let ids: string[] = [];
  if (inbox) {
    // Рахуємо непрочитані через повідомлення зі статусом unread
    const msgsData = await zohoFetch(
      `/accounts/${accountId}/messages/view?folderId=${inbox.folderId as string}&limit=50&start=0`
    );
    const messages: Record<string, unknown>[] = msgsData?.data ?? [];
    ids = messages.filter(m => m.status === '0' || m.status === 0).map(m => m.messageId as string).filter(Boolean);
  }
  zohoCache = { at: Date.now(), ids };
  return ids;
}

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  try {
    const tokens = await getTokenRow();
    if (!tokens) return NextResponse.json({ count: 0 });

    const ids = await zohoUnreadIds();
    if (!ids.length) return NextResponse.json({ count: 0 });

    // Subtract locally marked as read
    const { data: readRows } = await db.from('mail_read_messages').select('message_id').in('message_id', ids);
    const readSet = new Set((readRows ?? []).map(r => r.message_id));
    const count = ids.filter(id => !readSet.has(id)).length;

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
