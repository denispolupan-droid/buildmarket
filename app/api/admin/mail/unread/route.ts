import { NextResponse } from 'next/server';
import { zohoFetch, getAccountId, getTokenRow } from '../../../../../lib/zoho-mail';

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
    const unread = messages.filter(m => m.isRead === '0' || m.isRead === false || m.isRead === 0).length;
    const firstMsg = messages[0] ?? {};
    const allKeys = Object.keys(firstMsg).map(k => `${k}=${JSON.stringify(firstMsg[k])}`);

    return NextResponse.json({ count: unread, folderId, total: messages.length, firstMsgFields: allKeys });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
